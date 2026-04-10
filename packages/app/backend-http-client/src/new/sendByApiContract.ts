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
  type SuccessfulHttpStatusCode,
} from '@lokalise/api-contracts'
import { type Client, type Dispatcher, Headers } from 'undici'
import type { HttpRequestContext } from '../client/types.ts'
import { parseSseStream } from './parseSseStream.ts'
import { type RetryConfig, resolveRetryConfig, withRetry } from './retry.ts'
import { UnexpectedResponseError } from './UnexpectedResponseError.ts'

export type ContractRequestOptions<DoCaptureAsError extends boolean = boolean> = {
  /**
   * Request context used to propagate the request ID (`x-request-id` header) for distributed tracing.
   */
  reqContext?: HttpRequestContext
  /**
   * When true, disables HTTP keep-alive so the connection is closed after the request.
   * Useful for one-off requests where connection reuse is undesirable.
   */
  disableKeepAlive?: boolean
  /**
   * Retry configuration. When provided, failed requests are retried according to the policy.
   * Pass `true` to use all defaults (`maxRetries: 2`, exponential backoff, standard status codes).
   */
  retry?: RetryConfig | true
  /**
   * Per-attempt timeout in milliseconds. Each attempt (including retries) gets its own independent timeout.
   * For a total deadline across all attempts, pass an `AbortSignal` via `signal` instead.
   */
  timeout?: number
  /**
   * An AbortSignal to cancel the in-flight request. Use this for manual cancellation or
   * a total deadline across all attempts — e.g. `AbortSignal.timeout(5000)` to abort
   * after 5 seconds regardless of retries, or `AbortSignal.any([...])` to combine sources.
   * When aborted, the request rejects with an `AbortError`.
   */
  signal?: AbortSignal
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

type AllContractResponses<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean,
> = TIsStreaming extends true
  ? InferSseClientResponse<TApiContract>
  : InferNonSseClientResponse<TApiContract>

// captureAsError: true → success codes only; captureAsError: false → all codes from contract
type ContractResultType<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean,
  TDoCaptureAsError extends boolean,
> = TDoCaptureAsError extends true
  ? Extract<
      AllContractResponses<TApiContract, TIsStreaming>,
      { statusCode: SuccessfulHttpStatusCode }
    >
  : AllContractResponses<TApiContract, TIsStreaming>

// captureAsError: true → UnexpectedResponseError | <error-status-code responses from contract>
// captureAsError: false → only UnexpectedResponseError (all contract responses go to result)
type ContractErrorType<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean,
  TDoCaptureAsError extends boolean,
> = TDoCaptureAsError extends true
  ?
      | UnexpectedResponseError
      | Exclude<
          AllContractResponses<TApiContract, TIsStreaming>,
          { statusCode: SuccessfulHttpStatusCode }
        >
  : UnexpectedResponseError

type ReturnTypeForContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean,
  TDoCaptureAsError extends boolean,
> = Either<
  ContractErrorType<TApiContract, TIsStreaming, TDoCaptureAsError>,
  ContractResultType<TApiContract, TIsStreaming, TDoCaptureAsError>
>

const resolveRequestHeaders = <T>(headers: HeadersParam<T>): T | Promise<T> => {
  return typeof headers === 'function' ? (headers as () => T | Promise<T>)() : headers
}

function normalizeResponseHeaders(
  rawHeaders: Dispatcher.ResponseData['headers'],
): Record<string, string | undefined> {
  const headers = new Headers()

  for (const [key, value] of Object.entries(rawHeaders)) {
    /* v8 ignore start */
    if (!value) {
      continue
    }
    /* v8 ignore stop */
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

async function parseBody(body: Dispatcher.ResponseData['body'], resolvedEntry: ResponseKind) {
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
      return resolvedEntry.schema.parse(json)
    }
    case 'sse': {
      return parseSseStream(body, resolvedEntry.schemaByEventName)
    }
  }
}

export async function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
  TCaptureAsError extends boolean = true,
>(
  client: Client,
  apiContract: TApiContract,
  params: ClientRequestParams<TApiContract, TIsStreaming>,
  options: ContractRequestOptions<TCaptureAsError> = {},
): Promise<ReturnTypeForContract<TApiContract, TIsStreaming, TCaptureAsError>> {
  const strictContentType = options.strictContentType ?? true
  const captureAsError = options.captureAsError ?? true

  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(apiContract)

  const requestHeaders: Record<string, string> = (await resolveRequestHeaders(params.headers)) ?? {}

  if (options.reqContext) {
    requestHeaders['x-request-id'] = options.reqContext.reqId
  }
  if (useStreaming) {
    requestHeaders.accept = 'text/event-stream'
  }
  if (params.body) {
    requestHeaders['content-type'] = 'application/json'
  }

  const requestFn = () => {
    const signals = [
      options.signal,
      options.timeout !== undefined ? AbortSignal.timeout(options.timeout) : undefined,
    ].filter((signal) => signal !== undefined)

    return client.request({
      method: apiContract.method.toUpperCase(),
      path: buildRequestPath(apiContract.pathResolver(params.pathParams), params.pathPrefix),
      body: params.body ? JSON.stringify(params.body) : undefined,
      query: params.queryParams,
      headers: requestHeaders,
      reset: options.disableKeepAlive ?? false,
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    })
  }

  const response = options.retry
    ? await withRetry(requestFn, resolveRetryConfig(options.retry), options.signal)
    : await requestFn()

  const normalizedHeaders = normalizeResponseHeaders(response.headers)
  const contentType = normalizedHeaders['content-type']

  const resolvedResponseEntry = resolveResponseEntry(
    apiContract.responsesByStatusCode,
    response.statusCode,
    contentType,
    strictContentType,
  )

  if (!resolvedResponseEntry) {
    const body = await response.body.text()
    return { error: new UnexpectedResponseError(response.statusCode, normalizedHeaders, body) }
  }

  const parsedBody = await parseBody(response.body, resolvedResponseEntry)

  const parsedHeaders = apiContract.responseHeaderSchema
    ? { ...normalizedHeaders, ...apiContract.responseHeaderSchema.parse(normalizedHeaders) }
    : normalizedHeaders

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
