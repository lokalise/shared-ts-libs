import { Readable } from 'node:stream'
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
import { ServerSentEventTransformStream } from 'parse-sse'
import type { Client, Dispatcher } from 'undici'
import { REQUEST_ID_HEADER } from '../client/constants.ts'
import type { HttpRequestContext } from '../client/types.ts'
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

/**
 * Converts undici's raw response headers into a flat `Record<string, string>`.
 *
 * Multi-value headers (e.g. arrays from undici) are joined into a single comma-separated
 * string, which is correct for most headers but **not** for `set-cookie` — cookies must
 * remain separate and are mangled by this join. A future `rawHeaders` field on the result
 * may expose the original undici headers as an escape hatch.
 */
function normalizeResponseHeaders(
  rawHeaders: Dispatcher.ResponseData['headers'],
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(rawHeaders)) {
    if (!value) {
      continue
    }

    result[key] = Array.isArray(value) ? value.join(', ') : value
  }

  return result
}

async function* parseSseStream(
  body: Dispatcher.ResponseData['body'],
  schemaByEventName: SseSchemaByEventName,
): AsyncGenerator {
  const sseStream = Readable.toWeb(body)
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new ServerSentEventTransformStream())

  for await (const { type, data, lastEventId, retry } of sseStream) {
    const schema = schemaByEventName[type]

    if (!schema) {
      throw new Error(`Schema for event "${type}" not found.`)
    }

    yield { type, data: schema.parse(JSON.parse(data)), lastEventId, retry }
  }
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

/**
 * Executes an HTTP request described by `apiContract` and returns a type-safe `Either`.
 *
 * Response bodies are parsed and validated against the schema defined in
 * `responsesByStatusCode`. Status codes absent from the contract are returned as
 * `Either.error` with an {@link UnexpectedResponseError}.
 *
 * By default (`captureAsError: true`), 4xx/5xx responses defined in the contract are
 * also returned as `Either.error`; pass `captureAsError: false` to receive all
 * contract-defined responses as `Either.result`.
 *
 * @see {@link ContractRequestOptions} for timeout, retry, cancellation, and other options.
 */
export async function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
  TCaptureAsError extends boolean = true,
>(
  client: Client,
  apiContract: TApiContract,
  params: ClientRequestParams<TApiContract, TIsStreaming> & ContractRequestOptions<TCaptureAsError>,
): Promise<ReturnTypeForContract<TApiContract, TIsStreaming, TCaptureAsError>> {
  const strictContentType = params.strictContentType ?? true
  const captureAsError = params.captureAsError ?? true

  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(apiContract)

  const requestHeaders: Record<string, string> = (await resolveRequestHeaders(params.headers)) ?? {}

  if (params.reqContext) {
    requestHeaders[REQUEST_ID_HEADER] = params.reqContext.reqId
  }
  if (useStreaming) {
    requestHeaders.accept = 'text/event-stream'
  }
  if (params.body) {
    requestHeaders['content-type'] = 'application/json'
  }

  const baseRequest = {
    method: apiContract.method.toUpperCase(),
    path: buildRequestPath(apiContract.pathResolver(params.pathParams), params.pathPrefix),
    body: params.body ? JSON.stringify(params.body) : undefined,
    query: params.queryParams,
    headers: requestHeaders,
    reset: params.disableKeepAlive ?? false,
  }

  // AbortSignal.timeout() creates a fresh timer, so it must be built per attempt.
  const requestFn = () => {
    const signal =
      params.signal && params.timeout !== undefined
        ? AbortSignal.any([params.signal, AbortSignal.timeout(params.timeout)])
        : params.signal
          ? params.signal
          : params.timeout !== undefined
            ? AbortSignal.timeout(params.timeout)
            : undefined

    return client.request({ ...baseRequest, signal })
  }

  const response = params.retry
    ? await withRetry(requestFn, resolveRetryConfig(params.retry), params.signal)
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
