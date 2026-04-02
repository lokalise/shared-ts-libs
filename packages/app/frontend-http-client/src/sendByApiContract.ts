import {
  buildRequestPath,
  hasAnySuccessSseResponse,
  resolveContractResponse,
  type ApiContract,
  type ContractResponseMode,
  type HttpStatusCode,
  type InferNonSseClientResponse,
  type InferSchemaInput,
  type InferSseClientResponse,
  type ResponseKind,
  type ResponsesByStatusCode,
  type SseSchemaByEventName,
  type SuccessfulHttpStatusCode,
} from '@lokalise/api-contracts'
import { stringify } from 'fast-querystring'
import type {ConfiguredMiddleware, WretchError} from 'wretch'
import type { z } from 'zod/v4'
import type { WretchInstance } from './types.ts'
import { parseSseStream } from './utils/sseUtils.ts'

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

type CondKey<T, Key extends string, Extra = T> = [T] extends [undefined]
  ? { [K in Key]?: undefined }
  : { [K in Key]: Extra }

type HeadersParam<T> = T | (() => T) | (() => Promise<T>)

type RequestParams<PathParams, Body, QueryParams, Headers> = Prettify<
  { pathPrefix?: string } & CondKey<PathParams, 'pathParams'> &
    CondKey<Body, 'body'> &
    CondKey<QueryParams, 'queryParams'> &
    CondKey<Headers, 'headers', HeadersParam<Headers>>
>

type AnyRequestParams = RequestParams<any, any, any, any>

type ExtractRequestBody<T> = T extends { requestBodySchema: z.ZodType }
  ? T['requestBodySchema']
  : undefined

// streaming param: required for dual-mode, forbidden otherwise
type StreamingParam<T extends ResponsesByStatusCode, IsStreaming extends boolean> =
  ContractResponseMode<T> extends 'dual' ? { streaming: IsStreaming } : { streaming?: never }

// SSE-only contracts default IsStreaming to true; everything else to false
type DefaultStreaming<T extends ResponsesByStatusCode> =
  ContractResponseMode<T> extends 'sse' ? true : false

// mapHttpErrors: true → filter to success codes only; mapHttpErrors: false → all codes from contract
type MapHttpErrorsFilter<T, DoMapHttpErrors extends boolean> =
  DoMapHttpErrors extends true ? Extract<T, { statusCode: SuccessfulHttpStatusCode }> : T

// fetch headers are simple string-to-string (no multi-value)
type FetchHeaders = Record<string, string>

type Either<E, R> = { error: E; result: undefined } | { error: undefined; result: R }

type ReturnTypeForContract<
  T extends ResponsesByStatusCode,
  IsStreaming extends boolean,
  DoMapHttpErrors extends boolean,
> = Either<
  WretchError,
  MapHttpErrorsFilter<
    IsStreaming extends true
      ? InferSseClientResponse<T, FetchHeaders>
      : InferNonSseClientResponse<T, FetchHeaders>,
    DoMapHttpErrors
  >
>

export type ContractRequestOptions<DoMapHttpErrors extends boolean = boolean> = {
  validateResponse?: boolean
  /**
   * When true, non-success HTTP responses are mapped to Either.error.
   * When false (default), all HTTP responses are returned in Either.result regardless of status code.
   */
  mapHttpErrors?: DoMapHttpErrors
  strictContentType?: boolean
  signal?: AbortSignal
}

const resolveHeaders = <T>(headers: HeadersParam<T>): T | Promise<T> =>
  typeof headers === 'function' ? (headers as () => T | Promise<T>)() : headers

function extractHeaders(response: Response): FetchHeaders {
  const headers: FetchHeaders = {}

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

export async function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
  TMapHttpErrors extends boolean = false,
>(
  wretch: WretchInstance,
  routeContract: TApiContract,
  params: RequestParams<
    InferSchemaInput<TApiContract['requestPathParamsSchema']>,
    InferSchemaInput<ExtractRequestBody<TApiContract>>,
    InferSchemaInput<TApiContract['requestQuerySchema']>,
    InferSchemaInput<TApiContract['requestHeaderSchema']>
  > &
    StreamingParam<TApiContract['responsesByStatusCode'], TIsStreaming>,
  options: ContractRequestOptions<TMapHttpErrors> = {} as ContractRequestOptions<TMapHttpErrors>,
): Promise<ReturnTypeForContract<TApiContract['responsesByStatusCode'], TIsStreaming, TMapHttpErrors>> {
  const anyParams = params as AnyRequestParams
  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(routeContract)

  const signal = options.signal ?? new AbortController().signal
  const mapHttpErrors = options.mapHttpErrors ?? false
  const validateResponse = options.validateResponse ?? false
  const strictContentType = options.strictContentType ?? true

  const resolvedHeaders: Record<string, string> = await resolveHeaders(anyParams.headers) ?? {}

  if (useStreaming) {
    resolvedHeaders.accept = 'text/event-stream'
  }
  if (anyParams.body) {
    resolvedHeaders['content-type'] = 'application/json'
  }

  const path = buildRequestPath(routeContract.pathResolver(anyParams.pathParams), anyParams.pathPrefix)
  const queryString = anyParams.queryParams
    ? stringify(anyParams.queryParams)
    : ''
  const fullUrl = queryString ? `${path}?${queryString}` : path
  const bodyString = anyParams.body ? JSON.stringify(anyParams.body) : undefined

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

  const wretchWithMiddleware = wretch.middlewares([cloneErrorResponseMiddleware])

  let response: Response

  try {
    if (routeContract.method === 'get' || routeContract.method === 'delete') {
      response = await wretchWithMiddleware.url(fullUrl).headers(resolvedHeaders).options({ signal })[routeContract.method]().res()
    } else {
      response = await wretchWithMiddleware.url(fullUrl).headers(resolvedHeaders).options({ signal })[routeContract.method](bodyString).res()
    }
  } catch (err) {
    if (!clonedErrorResponse) {
      throw new Error('Unable to retrieve response', { cause: err })
    }
    response = clonedErrorResponse
  }

  const responseSchemas = routeContract.responsesByStatusCode[response.status as HttpStatusCode]

  if (!responseSchemas) {
    await response.body?.cancel()
    throw new Error('Could not map response statusCode')
  }

  const contentType = response.headers.get('content-type') ?? undefined
  const resolvedEntry = resolveContractResponse(responseSchemas, contentType, strictContentType)

  if (!resolvedEntry) {
    await response.body?.cancel()
    throw new Error(`Could not resolve response contentType "${contentType}"`)
  }

  const body = await parseBody(response, resolvedEntry, validateResponse, signal)
  const headers = extractHeaders(response)

  const parsedResponse = {
    statusCode: response.status,
    headers,
    body,
  }

  if (!mapHttpErrors && !response.ok) {
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from TIsStreaming
    return { error: parsedResponse } as any
  }

  // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from TIsStreaming
  return { result: parsedResponse } as any
}
