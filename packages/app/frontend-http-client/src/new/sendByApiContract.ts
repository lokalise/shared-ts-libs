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
import { stringify } from 'fast-querystring'
import { ServerSentEventTransformStream } from 'parse-sse'
import type { ConfiguredMiddleware } from 'wretch'
import type { WretchInstance } from '../types.ts'
import { UnexpectedResponseError } from './UnexpectedResponseError.ts'

export type ContractRequestOptions<DoCaptureAsError extends boolean = boolean> = {
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
  /**
   * When `true` (default), returns an error if the response `content-type` doesn't match the contract entry.
   * When `false`, falls back to the entry's kind for single-entry responses.
   */
  strictContentType?: boolean
  /**
   * An `AbortSignal` to cancel the in-flight request.
   */
  signal?: AbortSignal
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

const resolveRequestHeaders = <T>(headers: HeadersParam<T>): T | Promise<T> =>
  typeof headers === 'function' ? (headers as () => T | Promise<T>)() : headers

function normalizeResponseHeaders(response: Response): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {}

  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  return headers
}

async function* parseSseStream(
  response: Response,
  schemaByEventName: SseSchemaByEventName,
): AsyncGenerator<{ type: string; data: unknown; lastEventId: string; retry: number | undefined }> {
  /* v8 ignore start */
  if (!response.body) {
    throw new Error('Response body is null')
  }
  /* v8 ignore stop */

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new ServerSentEventTransformStream())

  for await (const event of reader) {
    const { type, data, lastEventId, retry } = event
    const schema = schemaByEventName[type]

    if (!schema) {
      throw new Error(`Schema for event "${type}" not found.`)
    }

    yield { type, data: schema.parse(JSON.parse(data)), lastEventId, retry }
  }
}

async function parseBody(response: Response, resolvedEntry: ResponseKind) {
  switch (resolvedEntry.kind) {
    case 'noContent':
      return null
    case 'text':
      return await response.text()
    case 'blob':
      return await response.blob()
    case 'json': {
      const json = await response.json()
      return resolvedEntry.schema.parse(json)
    }
    case 'sse':
      return parseSseStream(response, resolvedEntry.schemaByEventName)
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
 * @see {@link ContractRequestOptions} for cancellation and other options.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it is acceptable
export async function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
  TCaptureAsError extends boolean = true,
>(
  wretch: WretchInstance,
  apiContract: TApiContract,
  params: ClientRequestParams<TApiContract, TIsStreaming> & ContractRequestOptions<TCaptureAsError>,
): Promise<ReturnTypeForContract<TApiContract, TIsStreaming, TCaptureAsError>> {
  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(apiContract)

  const signal = params.signal ?? new AbortController().signal
  const captureAsError = params.captureAsError ?? true
  const strictContentType = params.strictContentType ?? true

  const requestHeaders: Record<string, string> = (await resolveRequestHeaders(params.headers)) ?? {}

  if (useStreaming) {
    requestHeaders.accept = 'text/event-stream'
  }
  if (params.body !== undefined) {
    requestHeaders['content-type'] = 'application/json'
  }

  const path = buildRequestPath(apiContract.pathResolver(params.pathParams), params.pathPrefix)
  const queryString = params.queryParams ? stringify(params.queryParams) : ''
  const fullUrl = queryString ? `${path}?${queryString}` : path
  const bodyString = params.body !== undefined ? JSON.stringify(params.body) : undefined

  // Middleware that clones the response for non-2xx statuses before wretch consumes the body
  // during WretchError creation, allowing contract-based body parsing even for error responses.
  let clonedErrorResponse: Response | undefined

  const cloneErrorResponseMiddleware: ConfiguredMiddleware = (next) => async (url, opts) => {
    const fetchResponse = await next(url, opts)
    if (!fetchResponse.ok) {
      clonedErrorResponse = fetchResponse.clone()
    }
    return fetchResponse
  }

  const wretchInstance = wretch
    .middlewares([cloneErrorResponseMiddleware])
    .url(fullUrl)
    .headers(requestHeaders)
    .options({ signal })

  let response: Response

  try {
    if (apiContract.method === 'get' || apiContract.method === 'delete') {
      response = await wretchInstance[apiContract.method]().res()
    } else {
      response = await wretchInstance[apiContract.method](bodyString).res()
    }
    /* v8 ignore start */
    if (clonedErrorResponse) {
      clonedErrorResponse.body?.cancel()
    }
    /* v8 ignore stop */
  } catch (err) {
    if (!clonedErrorResponse) {
      throw err
    }
    response = clonedErrorResponse
  }

  const normalizedHeaders = normalizeResponseHeaders(response)
  const contentType = normalizedHeaders['content-type']

  const resolvedResponseEntry = resolveResponseEntry(
    apiContract.responsesByStatusCode,
    response.status,
    contentType,
    strictContentType,
  )

  if (!resolvedResponseEntry) {
    const body = await response.text()
    return { error: new UnexpectedResponseError(response.status, normalizedHeaders, body) }
  }

  const parsedBody = await parseBody(response, resolvedResponseEntry)

  const parsedHeaders = apiContract.responseHeaderSchema
    ? {
        ...normalizedHeaders,
        ...apiContract.responseHeaderSchema.parse(normalizedHeaders),
      }
    : normalizedHeaders

  const parsedResponse = {
    statusCode: response.status,
    headers: parsedHeaders,
    body: parsedBody,
  }

  if (captureAsError && !response.ok) {
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from TIsStreaming
    return { error: parsedResponse } as any
  }

  // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from TIsStreaming
  return { result: parsedResponse } as any
}
