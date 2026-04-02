import type { Readable } from 'node:stream'
import {
  type ApiContract,
  buildRequestPath,
  type ContractResponseMode,
  type HttpStatusCode,
  hasAnySuccessSseResponse,
  type InferNonSseClientResponse,
  type InferSchemaInput,
  type InferSseClientResponse,
  type ResponseKind,
  type ResponsesByStatusCode,
  resolveContractResponse,
  type SseSchemaByEventName,
  type SuccessfulHttpStatusCode,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import type { Client, Dispatcher } from 'undici'
import {
  type Either,
  type InternalRequestError,
  isRequestResult,
  NO_RETRY_CONFIG,
  type RequestResult,
  sendWithRetryReturnStream,
} from 'undici-retry'
import type { z } from 'zod/v4'
import { DEFAULT_OPTIONS } from './constants.ts'
import type { ContractRequestOptions } from './types.ts'

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

type CondKey<T, TKey extends string, TExtra = T> = [T] extends [undefined]
  ? { [K in TKey]?: undefined }
  : { [K in TKey]: TExtra }

type HedersParam<T> = T | (() => T) | (() => Promise<T>)

type RequestParams<TPathParams, TBody, TQueryParams, THeaders> = Prettify<
  { pathPrefix?: string } & CondKey<TPathParams, 'pathParams'> &
    CondKey<TBody, 'body'> &
    CondKey<TQueryParams, 'queryParams'> &
    CondKey<THeaders, 'headers', HedersParam<THeaders>>
>

// biome-ignore lint/suspicious/noExplicitAny: we accept any request params here
type AnyRequestParams = RequestParams<any, any, any, any>

type ExtractRequestBody<T> = T extends { requestBodySchema: z.ZodType }
  ? T['requestBodySchema']
  : undefined

// streaming param: required for dual-mode, forbidden otherwise
type StreamingParam<T extends ResponsesByStatusCode, TIsStreaming extends boolean> =
  ContractResponseMode<T> extends 'dual' ? { streaming: TIsStreaming } : { streaming?: never }

// SSE-only contracts default IsStreaming to true; everything else to false
type DefaultStreaming<T extends ResponsesByStatusCode> =
  ContractResponseMode<T> extends 'sse' ? true : false

// captureAsError: true → filter to success codes only; captureAsError: false → all codes
type CaptureAsErrorFilter<T, TDoCaptureAsError extends boolean> = TDoCaptureAsError extends true
  ? Extract<T, { statusCode: SuccessfulHttpStatusCode }>
  : T

type ReturnTypeForContract<
  T extends ResponsesByStatusCode,
  TIsStreaming extends boolean,
  TDoCaptureAsError extends boolean,
> = Either<
  RequestResult<unknown> | InternalRequestError,
  CaptureAsErrorFilter<
    TIsStreaming extends true ? InferSseClientResponse<T> : InferNonSseClientResponse<T>,
    TDoCaptureAsError
  >
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
  stream: Readable,
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

const resolveHeaders = <T>(headers: HedersParam<T>): T | Promise<T> => {
  return typeof headers === 'function' ? (headers as () => T | Promise<T>)() : headers
}

async function buildBaseRequest(
  routeContract: ApiContract,
  params: AnyRequestParams,
  options: ContractRequestOptions<boolean>,
) {
  const resolvedHeaders = (await resolveHeaders(params.headers)) ?? {}

  return {
    ...DEFAULT_OPTIONS,
    validateResponse: options.validateResponse ?? DEFAULT_OPTIONS.validateResponse,
    path: buildRequestPath(routeContract.pathResolver(params.pathParams), params.pathPrefix),
    method: routeContract.method.toUpperCase(),
    body: params.body ? JSON.stringify(params.body) : undefined,
    query: params.queryParams,
    headers: copyWithoutUndefined({
      'x-request-id': options.reqContext?.reqId,
      ...resolvedHeaders,
    }),
    reset: options.disableKeepAlive ?? false,
    signal: options.signal,
    throwOnError: undefined,
  }
}

async function parseBody(
  result: RequestResult<Dispatcher.ResponseData['body']>,
  resolvedEntry: ResponseKind,
  validateResponse: boolean,
) {
  switch (resolvedEntry.kind) {
    case 'noContent': {
      await result.body.dump()
      return null
    }
    case 'text': {
      return await result.body.text()
    }
    case 'blob': {
      return await result.body.blob()
    }
    case 'json': {
      const json = await result.body.json()
      return validateResponse ? resolvedEntry.schema.parse(json) : json
    }
    case 'sse': {
      return parseSseStream(result.body, resolvedEntry.schemaByEventName)
    }
  }
}

export async function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
  TCaptureAsError extends boolean = true,
>(
  client: Client,
  routeContract: TApiContract,
  params: RequestParams<
    InferSchemaInput<TApiContract['requestPathParamsSchema']>,
    InferSchemaInput<ExtractRequestBody<TApiContract>>,
    InferSchemaInput<TApiContract['requestQuerySchema']>,
    InferSchemaInput<TApiContract['requestHeaderSchema']>
  > &
    StreamingParam<TApiContract['responsesByStatusCode'], TIsStreaming>,
  options: ContractRequestOptions<TCaptureAsError>,
): Promise<
  ReturnTypeForContract<TApiContract['responsesByStatusCode'], TIsStreaming, TCaptureAsError>
> {
  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(routeContract)

  const captureAsError = options.captureAsError ?? true
  const retryConfig = options.retryConfig ?? NO_RETRY_CONFIG

  const baseRequest = await buildBaseRequest(routeContract, params as AnyRequestParams, options)

  const request = useStreaming
    ? { ...baseRequest, headers: { ...baseRequest.headers, accept: 'text/event-stream' } }
    : baseRequest

  const sendOutput = await sendWithRetryReturnStream(client, request, retryConfig, {
    throwOnInternalError: false,
    requestLabel: options.requestLabel,
  })

  if (sendOutput.error) {
    if (!isRequestResult(sendOutput.error)) {
      // Internal/network error — always throw
      throw sendOutput.error
    }

    if (captureAsError) {
      // Non-2xx HTTP response mapped to Either.error
      // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from TCaptureAsError
      return { error: sendOutput.error, result: undefined } as any
    }

    // captureAsError: false — process non-2xx response through the contract
    // Note: undici-retry eagerly parses the error body via resolveBody(), so it is
    // already a plain JS value (object/string), not a stream.
    return resolveAndReturnParsedResponse(
      sendOutput.error,
      routeContract,
      request.validateResponse,
      options.strictContentType ?? true,
    )
  }

  return resolveAndParseResponse(
    sendOutput.result,
    routeContract,
    request.validateResponse,
    options.strictContentType ?? true,
  )
}

async function resolveAndParseResponse(
  result: RequestResult<Dispatcher.ResponseData['body']>,
  routeContract: ApiContract,
  validateResponse: boolean,
  strictContentType: boolean,
) {
  const responseSchemas = routeContract.responsesByStatusCode[result.statusCode as HttpStatusCode]

  if (!responseSchemas) {
    await result.body.dump()
    throw new Error('Could not map response statusCode')
  }

  const rawContentType = result.headers['content-type']
  const contentType = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType

  const resolvedEntry = resolveContractResponse(responseSchemas, contentType, strictContentType)

  if (!resolvedEntry) {
    await result.body.dump()
    throw new Error(`Could not resolve response contentType "${contentType}"`)
  }

  const body = await parseBody(result, resolvedEntry, validateResponse)

  return {
    result: { body, statusCode: result.statusCode, headers: result.headers },
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from IsStreaming
  } as any
}

// Used for non-2xx responses when captureAsError: false.
// undici-retry eagerly parses error bodies (JSON → object, otherwise → string),
// so we cannot re-read the stream — instead we validate the pre-parsed value.
function resolveAndReturnParsedResponse(
  result: RequestResult<unknown>,
  routeContract: ApiContract,
  validateResponse: boolean,
  strictContentType: boolean,
) {
  const responseSchemas = routeContract.responsesByStatusCode[result.statusCode as HttpStatusCode]

  if (!responseSchemas) {
    throw new Error('Could not map response statusCode')
  }

  const rawContentType = result.headers['content-type']
  const contentType = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType

  const resolvedEntry = resolveContractResponse(responseSchemas, contentType, strictContentType)

  if (!resolvedEntry) {
    throw new Error(`Could not resolve response contentType "${contentType}"`)
  }

  const body =
    resolvedEntry.kind === 'noContent'
      ? null
      : resolvedEntry.kind === 'json' && validateResponse
        ? resolvedEntry.schema.parse(result.body)
        : result.body

  return {
    result: { body, statusCode: result.statusCode, headers: result.headers },
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from IsStreaming
  } as any
}
