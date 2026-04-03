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
import type { ConfiguredMiddleware } from 'wretch'
import type { WretchInstance } from './types.ts'
import { parseSseStream } from './utils/sseUtils.ts'

// captureAsError: true → filter to success codes only; captureAsError: false → all codes from contract
type CaptureAsErrorFilter<T, TDoCaptureAsError extends boolean> = TDoCaptureAsError extends true
  ? Extract<T, { statusCode: SuccessfulHttpStatusCode }>
  : T

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

export type ContractRequestOptions<DoCaptureAsError extends boolean = boolean> = {
  /**
   * When true (default), the response body is validated against the contract schema.
   * When false, the body is returned as-is without validation.
   */
  validateResponse?: boolean
  /**
   * When true, non-success HTTP responses are mapped to Either.error.
   * When false (default), all HTTP responses are returned in Either.result regardless of status code.
   */
  captureAsError?: DoCaptureAsError
  /**
   * When true (default), throws if the response content-type doesn't match the contract entry.
   * When false, falls back to the contract entry's kind when content-type is absent or mismatched —
   * only applies to single-entry responses (not anyOfResponses).
   */
  strictContentType?: boolean
  /**
   * An AbortSignal to cancel the request.
   */
  signal?: AbortSignal
}

const resolveHeaders = <T>(headers: HeadersParam<T>): T | Promise<T> =>
  typeof headers === 'function' ? (headers as () => T | Promise<T>)() : headers

function normalizeHeaders(response: Response): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {}

  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  return headers
}

async function* parseSseStreamWithSchema(
  response: Response,
  schemaByEventName: SseSchemaByEventName,
  signal: AbortSignal,
): AsyncGenerator<{ event: string; data: unknown }> {
  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()

  for await (const sseEvent of parseSseStream(reader, signal)) {
    const schema = schemaByEventName[sseEvent.event]

    if (!schema) {
      throw new Error(`Schema for event "${sseEvent.event}" not found.`)
    }

    const parsed = JSON.parse(sseEvent.data)
    yield { event: sseEvent.event, data: schema.parse(parsed) }
  }
}

async function parseBody(
  response: Response,
  resolvedEntry: ResponseKind,
  validateResponse: boolean,
  signal: AbortSignal,
) {
  switch (resolvedEntry.kind) {
    case 'noContent':
      return null
    case 'text':
      return await response.text()
    case 'blob':
      return await response.blob()
    case 'json': {
      const json = await response.json()
      return validateResponse ? resolvedEntry.schema.parse(json) : json
    }
    case 'sse':
      return parseSseStreamWithSchema(response, resolvedEntry.schemaByEventName, signal)
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it is acceptable
export async function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
  TCaptureAsError extends boolean = true,
>(
  wretch: WretchInstance,
  routeContract: TApiContract,
  params: ClientRequestParams<TApiContract, TIsStreaming>,
  options: ContractRequestOptions<TCaptureAsError> = {},
): Promise<ReturnTypeForContract<TApiContract, TIsStreaming, TCaptureAsError>> {
  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(routeContract)

  const signal = options.signal ?? new AbortController().signal
  const captureAsError = options.captureAsError ?? true
  const validateResponse = options.validateResponse ?? true
  const strictContentType = options.strictContentType ?? true

  const requestHeaders: Record<string, string> = (await resolveHeaders(params.headers)) ?? {}

  if (useStreaming) {
    requestHeaders.accept = 'text/event-stream'
  }
  if (params.body) {
    requestHeaders['content-type'] = 'application/json'
  }

  const path = buildRequestPath(routeContract.pathResolver(params.pathParams), params.pathPrefix)
  const queryString = params.queryParams ? stringify(params.queryParams) : ''
  const fullUrl = queryString ? `${path}?${queryString}` : path
  const bodyString = params.body ? JSON.stringify(params.body) : undefined

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
    if (routeContract.method === 'get' || routeContract.method === 'delete') {
      response = await wretchInstance[routeContract.method]().res()
    } else {
      response = await wretchInstance[routeContract.method](bodyString).res()
    }
    if (clonedErrorResponse) {
      clonedErrorResponse.body?.cancel()
    }
  } catch (err) {
    if (!clonedErrorResponse) {
      return { error: err }
    }
    response = clonedErrorResponse
  }

  const normalizedHeaders = normalizeHeaders(response)
  const parsedHeaders =
    validateResponse && routeContract.responseHeaderSchema
      ? {
          ...normalizedHeaders,
          ...routeContract.responseHeaderSchema.parse(normalizedHeaders),
        }
      : normalizedHeaders

  const contentType = normalizedHeaders['content-type']

  const resolution = resolveResponseEntry(
    routeContract.responsesByStatusCode,
    response.status,
    contentType,
    strictContentType,
  )

  if (!resolution) {
    await response.body?.cancel()
    return {
      error: new Error(
        `Failed to process API response. (Status: ${response.status}, Content-Type: ${contentType ?? 'unknown'})`,
      ),
    }
  }

  const parsedBody = await parseBody(response, resolution, validateResponse, signal)

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
