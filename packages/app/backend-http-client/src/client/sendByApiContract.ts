import type { Readable } from 'node:stream'
import {
  buildRequestPath,
  hasAnySuccessSseResponse,
  type ApiContract,
  type ContractResponseMode,
  type HttpStatusCode,
  type InferNonSseClientResponse,
  type InferSchemaInput,
  type InferSseClientResponse,
  type SuccessfulHttpStatusCode,
  type ResponseKind,
  type ResponsesByStatusCode,
  resolveContractResponse,
  type SseSchemaByEventName,
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
import { ResponseStatusError } from '../errors/ResponseStatusError.ts'
import { DEFAULT_OPTIONS } from './constants.ts'
import type { ContractRequestOptions } from './types.ts'

type DEFAULT_THROW_ON_ERROR = typeof DEFAULT_OPTIONS.throwOnError

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

type CondKey<T, Key extends string, Extra = T> = [T] extends [undefined]
  ? { [K in Key]?: undefined }
  : { [K in Key]: Extra }

type HedersParam<T> = T | (() => T) | (() => Promise<T>)

type RequestParams<PathParams, Body, QueryParams, Headers> = Prettify<
  { pathPrefix?: string } & CondKey<PathParams, 'pathParams'> &
    CondKey<Body, 'body'> &
    CondKey<QueryParams, 'queryParams'> &
    CondKey<Headers, 'headers', HedersParam<Headers>>
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

// throwOnError: true → filter to success codes only; throwOnError: false → all codes
type ThrowOnErrorFilter<T, DoThrowOnError extends boolean> =
  DoThrowOnError extends true ? Extract<T, { statusCode: SuccessfulHttpStatusCode }> : T

type ReturnTypeForContract<
  T extends ResponsesByStatusCode,
  IsStreaming extends boolean,
  DoThrowOnError extends boolean,
> = Either<
  RequestResult<unknown> | InternalRequestError,
  ThrowOnErrorFilter<
    IsStreaming extends true ? InferSseClientResponse<T> : InferNonSseClientResponse<T>,
    DoThrowOnError
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
  TDoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
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
  options: ContractRequestOptions<TDoThrowOnError>,
): Promise<ReturnTypeForContract<TApiContract['responsesByStatusCode'], TIsStreaming, TDoThrowOnError>> {
  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(routeContract)

  const throwOnError = options.throwOnError ?? DEFAULT_OPTIONS.throwOnError
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
    if (throwOnError) {
      throw isRequestResult(sendOutput.error)
        ? new ResponseStatusError(sendOutput.error, options.requestLabel)
        : sendOutput.error
    }

    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from DoThrowOnError
    return sendOutput as any
  }

  const responseSchemas =
    routeContract.responsesByStatusCode[sendOutput.result.statusCode as HttpStatusCode]

  if (!responseSchemas) {
    await sendOutput.result.body.dump()
    throw new Error('Could not map response statusCode')
  }

  const rawContentType = sendOutput.result.headers['content-type']
  const contentType = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType

  const resolvedEntry = resolveContractResponse(responseSchemas, contentType, options.strictContentType ?? true)

  if (!resolvedEntry) {
    await sendOutput.result.body.dump()
    throw new Error(`Could not resolve response contentType "${contentType}"`)
  }

  const body = await parseBody(sendOutput.result, resolvedEntry, request.validateResponse)

  return {
    result: {
      body,
      statusCode: sendOutput.result.statusCode,
      headers: sendOutput.result.headers,
    },
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from IsStreaming
  } as any
}
