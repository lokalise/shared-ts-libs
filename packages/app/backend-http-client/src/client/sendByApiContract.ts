import {
  type ApiContract,
  buildRequestPath,
  type ClientRequestParams,
  type DefaultStreaming,
  type HeadersParam,
  hasAnySuccessSseResponse,
  type InferNonSseClientResponse,
  type InferSseClientResponse,
  type ResponseKind,
  resolveResponseEntry,
  type SseSchemaByEventName,
  type SuccessfulHttpStatusCode,
} from '@lokalise/api-contracts'
import { type Client, type Dispatcher, Headers, interceptors, type RetryHandler } from 'undici'
import type { RetryConfig } from 'undici-retry'
import type { HttpRequestContext } from './types.ts'

// captureAsError: true → filter to success codes only; captureAsError: false → all codes from contract
type CaptureAsErrorFilter<T, TDoCaptureAsError extends boolean> = TDoCaptureAsError extends true
  ? Extract<T, { statusCode: SuccessfulHttpStatusCode }>
  : T

export type ContractRequestOptions<DoCaptureAsError extends boolean = boolean> = {
  requestLabel: string
  reqContext?: HttpRequestContext
  disableKeepAlive?: boolean
  retryConfig?: RetryConfig
  signal?: AbortSignal
  /**
   * When true (default), the response body is validated against the contract schema.
   * When false, the body is returned as-is without validation.
   */
  validateResponse?: boolean
  /**
   * When true (default), throws if the response content-type doesn't match the contract entry.
   * When false, falls back to the contract entry's kind when content-type is absent or mismatched —
   * only applies to single-entry responses (not anyOfResponses).
   */
  strictContentType?: boolean
  /**
   * Controls how HTTP 4xx/5xx responses defined in the contract are surfaced.
   *
   * - `true` (default): error status codes are returned as `Either.error`, and the result type is
   *   narrowed to success status codes only.
   * - `false`: all status codes defined in `responsesByStatusCode` are returned as `Either.result`.
   *
   * Status codes absent from the contract always surface as `Either.error` regardless of this option.
   */
  captureAsError?: DoCaptureAsError
}

type Either<TError, TResult> =
  | { error: TError; result?: never }
  | { error?: never; result: TResult }

type ReturnTypeForContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean,
  TDoCaptureAsError extends boolean,
> = Either<
  unknown,
  CaptureAsErrorFilter<
    TIsStreaming extends true
      ? InferSseClientResponse<TApiContract>
      : InferNonSseClientResponse<TApiContract>,
    TDoCaptureAsError
  >
>

function toUndiciRetryOptions(config: RetryConfig): RetryHandler.RetryOptions {
  return {
    throwOnError: false,
    maxRetries: config.maxAttempts - 1,
    statusCodes: config.statusCodesToRetry ? [...config.statusCodesToRetry] : undefined,
    errorCodes: config.retryOnTimeout
      ? ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN']
      : undefined,
    retry: config.delayResolver
      ? (err, { state }, callback) => {
          const stub = {
            statusCode: ('statusCode' in err && err.statusCode) ?? 500,
            headers: ('headers' in err && err.headers) ?? {},
          } as Dispatcher.ResponseData
          const delay = config.delayResolver?.(stub, state.counter, config.statusCodesToRetry ?? [])

          if (!delay || delay === -1) {
            callback(err)
          } else {
            setTimeout(() => {
              callback(null)
            }, delay)
          }
        }
      : undefined,
  }
}

function parseSseBlock(block: string, schemaByEventName: SseSchemaByEventName) {
  let event = 'message'
  let data = ''

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data += (data ? '\n' : '') + line.slice(5).trim()
    }
  }

  const schema = schemaByEventName[event]

  if (!schema) {
    throw new Error(`Schema for event "${event}" not found.`)
  }

  const parsed = JSON.parse(data)

  return { event, data: schema.parse(parsed) }
}

async function* parseSseStream(
  stream: Dispatcher.ResponseData['body'],
  schemaByEventName: SseSchemaByEventName,
): AsyncGenerator {
  let buffer = ''
  for await (const chunk of stream) {
    buffer += (chunk as Buffer).toString('utf8').replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      if (block.trim()) {
        const item = parseSseBlock(block, schemaByEventName)
        if (item !== null) yield item
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
}

function normalizeHeaders(
  rawHeaders: Dispatcher.ResponseData['headers'],
): Record<string, string | undefined> {
  const headers = new Headers()

  for (const [key, value] of Object.entries(rawHeaders)) {
    if (!value) {
      continue
    }
    if (Array.isArray(value)) {
      for (const element of value) {
        headers.append(key, element)
      }
    } else {
      headers.append(key, value)
    }
  }

  const result: Record<string, string | undefined> = {}

  headers.forEach((value, key) => {
    result[key] = value
  })

  return result
}

const resolveHeaders = <T>(headers: HeadersParam<T>): T | Promise<T> => {
  return typeof headers === 'function' ? (headers as () => T | Promise<T>)() : headers
}

async function parseBody(
  body: Dispatcher.ResponseData['body'],
  resolvedEntry: ResponseKind,
  validateResponse: boolean,
) {
  switch (resolvedEntry.kind) {
    case 'noContent': {
      await body.dump()
      return null
    }
    case 'text': {
      return await body.text()
    }
    case 'blob': {
      return await body.blob()
    }
    case 'json': {
      const json = await body.json()
      return validateResponse ? resolvedEntry.schema.parse(json) : json
    }
    case 'sse': {
      return parseSseStream(body, resolvedEntry.schemaByEventName)
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it is acceptable
export async function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
  TCaptureAsError extends boolean = true,
>(
  client: Client,
  apiContract: TApiContract,
  params: ClientRequestParams<TApiContract, TIsStreaming>,
  options: ContractRequestOptions<TCaptureAsError>,
): Promise<ReturnTypeForContract<TApiContract, TIsStreaming, TCaptureAsError>> {
  const validateResponse = options.validateResponse ?? true
  const strictContentType = options.strictContentType ?? true
  const captureAsError = options.captureAsError ?? true

  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(apiContract)

  const requestHeaders: Record<string, string> = (await resolveHeaders(params.headers)) ?? {}

  if (options.reqContext) {
    requestHeaders['x-request-id'] = options.reqContext.reqId
  }
  if (useStreaming) {
    requestHeaders.accept = 'text/event-stream'
  }
  if (params.body) {
    requestHeaders['content-type'] = 'application/json'
  }

  const dispatcher = options.retryConfig
    ? client.compose(interceptors.retry(toUndiciRetryOptions(options.retryConfig)))
    : client

  let response: Dispatcher.ResponseData
  try {
    response = await dispatcher.request({
      method: apiContract.method.toUpperCase(),
      path: buildRequestPath(apiContract.pathResolver(params.pathParams), params.pathPrefix),
      body: params.body ? JSON.stringify(params.body) : undefined,
      query: params.queryParams,
      headers: requestHeaders,
      reset: options.disableKeepAlive ?? false,
      signal: options.signal,
    })
  } catch (err) {
    return { error: err }
  }

  const normalizedHeaders = normalizeHeaders(response.headers)

  const parsedHeaders =
    validateResponse && apiContract.responseHeaderSchema
      ? { ...normalizedHeaders, ...apiContract.responseHeaderSchema.parse(normalizedHeaders) }
      : normalizedHeaders

  const contentType = normalizedHeaders['content-type']

  const resolvedResponseEntry = resolveResponseEntry(
    apiContract.responsesByStatusCode,
    response.statusCode,
    contentType,
    strictContentType,
  )

  if (!resolvedResponseEntry) {
    await response.body.dump()
    return {
      error: new Error(
        `Failed to process API response. (Status: ${response.statusCode}, Content-Type: ${contentType ?? 'unknown'})`,
      ),
    }
  }

  const parsedBody = await parseBody(response.body, resolvedResponseEntry, validateResponse)

  const parsedResponse = {
    statusCode: response.statusCode,
    headers: parsedHeaders,
    body: parsedBody,
  }

  if (captureAsError && response.statusCode >= 400) {
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from TCaptureAsError
    return { error: parsedResponse } as any
  }

  // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from TIsStreaming and TCaptureAsError
  return { result: parsedResponse } as any
}
