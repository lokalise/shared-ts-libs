import {
  type ApiContract,
  buildRequestPath,
  type ClientRequestParams,
  type DefaultStreaming,
  type HeadersParam,
  type HttpStatusCode,
  hasAnySuccessSseResponse,
  type InferNonSseClientResponse,
  type InferSseClientResponse,
  type ResponseKind,
  resolveContractResponse,
  type SseSchemaByEventName,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import { type Client, type Dispatcher, interceptors, type RetryHandler } from 'undici'
import type { RetryConfig } from 'undici-retry'
import type { HttpRequestContext } from './types.ts'

export type ContractRequestOptions = {
  reqContext?: HttpRequestContext
  requestLabel: string
  disableKeepAlive?: boolean
  retryConfig?: RetryConfig
  /**
   * When true (default), the response body is validated against the contract schema.
   * When false, the body is returned as-is without validation.
   */
  validateResponse?: boolean
  signal?: AbortSignal
  /**
   * When true (default), throws if the response content-type doesn't match the contract entry.
   * When false, falls back to the contract entry's kind when content-type is absent or mismatched —
   * only applies to single-entry responses (not anyOfResponses).
   */
  strictContentType?: boolean
}

type Either<TError, TResult> = { error: TError; result?: never } | { error?: never; result: TResult }

type ReturnTypeForContract<TApiContract extends ApiContract, TIsStreaming extends boolean> = Either<
  unknown,
  TIsStreaming extends true
    ? InferSseClientResponse<TApiContract>
    : InferNonSseClientResponse<TApiContract>
>

function parseSseBlock(block: string, schemaByEventName: SseSchemaByEventName) {
  let event = 'message'
  let data = ''

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data = line.slice(5).trim()
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
    buffer += (chunk as Buffer).toString('utf8')
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
          const delay = config.delayResolver!(stub, state.counter, config.statusCodesToRetry ?? [])

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

export async function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
>(
  client: Client,
  routeContract: TApiContract,
  params: ClientRequestParams<TApiContract, TIsStreaming>,
  options: ContractRequestOptions,
): Promise<ReturnTypeForContract<TApiContract, TIsStreaming>> {
  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(routeContract)

  const validateResponse = options.validateResponse ?? true
  const strictContentType = options.strictContentType ?? true

  const resolvedHeaders = (await resolveHeaders(params.headers)) ?? {}

  const dispatcher = options.retryConfig
    ? client.compose(interceptors.retry(toUndiciRetryOptions(options.retryConfig)))
    : client

  let response: Dispatcher.ResponseData
  try {
    response = await dispatcher.request({
      method: routeContract.method.toUpperCase(),
      path: buildRequestPath(routeContract.pathResolver(params.pathParams), params.pathPrefix),
      body: params.body ? JSON.stringify(params.body) : undefined,
      query: params.queryParams,
      headers: copyWithoutUndefined({
        'x-request-id': options.reqContext?.reqId,
        ...resolvedHeaders,
        ...(useStreaming ? { accept: 'text/event-stream' } : {}),
      }),
      reset: options.disableKeepAlive ?? false,
      signal: options.signal,
      throwOnError: false,
    })
  } catch (err) {
    return { error: err }
  }

  return resolveAndParseResponse(response, routeContract, validateResponse, strictContentType)
}

async function resolveAndParseResponse(
  response: Dispatcher.ResponseData,
  routeContract: ApiContract,
  validateResponse: boolean,
  strictContentType: boolean,
) {
  const responseSchemas = routeContract.responsesByStatusCode[response.statusCode as HttpStatusCode]

  if (!responseSchemas) {
    await response.body.dump()
    throw new Error('Could not map response statusCode')
  }

  const rawContentType = response.headers['content-type']
  const contentType = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType

  const resolvedEntry = resolveContractResponse(responseSchemas, contentType, strictContentType)

  if (!resolvedEntry) {
    await response.body.dump()
    throw new Error(`Could not resolve response contentType "${contentType}"`)
  }

  const body = await parseBody(response.body, resolvedEntry, validateResponse)
  const rawHeaders = response.headers as Record<string, string | undefined>
  const headers = routeContract.responseHeaderSchema
    ? {
        ...rawHeaders,
        ...(routeContract.responseHeaderSchema.parse(rawHeaders) as Record<string, string>),
      }
    : rawHeaders

  return {
    result: { body, statusCode: response.statusCode, headers },
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from IsStreaming
  } as any
}
