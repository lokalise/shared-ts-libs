import type { Readable } from 'node:stream'
import {
  type AvailableResponseModes,
  buildRequestPath,
  ContractNoBody,
  getSseSchemaByEventName,
  getSuccessResponseSchema,
  type HasAnySseSuccessResponse,
  type InferNonSseSuccessResponses,
  type InferSchemaInput,
  type InferSseSuccessResponses,
  type IsNoBodySuccessResponse,
  isBlobResponse,
  isTextResponse,
  type ResponseSchemasByStatusCode,
  type RouteContract,
  type SseEventOf,
  type SseSchemaByEventName,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import type { Client } from 'undici'
import {
  isRequestResult,
  NO_RETRY_CONFIG,
  type RetryConfig,
  sendWithRetry,
  sendWithRetryReturnStream,
} from 'undici-retry'
import type { z } from 'zod/v4'
import { ResponseStatusError } from '../errors/ResponseStatusError.ts'
import type { PayloadRouteRequestParams } from './apiContractTypes.ts'
import { DEFAULT_OPTIONS } from './constants.ts'
import type { ContractRequestOptions, RequestResultDefinitiveEither } from './types.ts'

type DEFAULT_THROW_ON_ERROR = typeof DEFAULT_OPTIONS.throwOnError

type ExtractRequestBody<T> = T extends { requestBodySchema: z.ZodType }
  ? T['requestBodySchema']
  : undefined

// true when T is a union with more than one member
type IsUnion<T, U = T> = (T extends unknown ? ([U] extends [T] ? 0 : 1) : never) extends 0
  ? false
  : true

// true when the contract has both SSE and non-SSE success responses (dual-mode)
type IsDualModeSse<T extends ResponseSchemasByStatusCode> =
  HasAnySseSuccessResponse<T> extends true
    ? IsUnion<AvailableResponseModes<T>> extends true
      ? true
      : false
    : false

// streaming: boolean is required only for dual-mode contracts; absent otherwise
type StreamingParam<T extends ResponseSchemasByStatusCode, IsStreaming extends boolean> =
  IsDualModeSse<T> extends true ? { streaming: IsStreaming } : { streaming?: never }

type NonStreamingResult<T extends ResponseSchemasByStatusCode, DoThrowOnError extends boolean> =
  IsNoBodySuccessResponse<T> extends true
    ? RequestResultDefinitiveEither<null, true, DoThrowOnError>
    : RequestResultDefinitiveEither<InferNonSseSuccessResponses<T>, false, DoThrowOnError>

type ReturnTypeForContract<
  T extends ResponseSchemasByStatusCode,
  IsStreaming extends boolean,
  DoThrowOnError extends boolean,
> =
  HasAnySseSuccessResponse<T> extends true
    ? IsDualModeSse<T> extends true
      ? IsStreaming extends true
        ? AsyncIterable<SseEventOf<InferSseSuccessResponses<T>>>
        : NonStreamingResult<T, DoThrowOnError>
      : AsyncIterable<SseEventOf<InferSseSuccessResponses<T>>>
    : NonStreamingResult<T, DoThrowOnError>

function parseSseBlock<T>(block: string, schemaByEventName: SseSchemaByEventName | null): T | null {
  let event = 'message'
  let data = ''
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data = line.slice(5).trim()
  }
  if (!data) return null
  const parsed = JSON.parse(data)
  const schema = schemaByEventName?.[event]
  return { event, data: schema ? schema.parse(parsed) : parsed } as T
}

async function* parseSseStream<T>(
  stream: Readable,
  schemaByEventName: SseSchemaByEventName | null,
): AsyncGenerator<T> {
  let buffer = ''
  for await (const chunk of stream) {
    buffer += (chunk as Buffer).toString('utf8')
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      if (block.trim()) {
        const item = parseSseBlock<T>(block, schemaByEventName)
        if (item !== null) yield item
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
}

function deriveNonSseMode(routeContract: RouteContract): string {
  const successSchemas = Object.entries(routeContract.responseSchemasByStatusCode)
    .filter(([code]) => Number(code) >= 200 && Number(code) < 300)
    .map(([, schema]) => schema)

  if (successSchemas.length === 0) return 'json'
  if (successSchemas.every((s) => s === ContractNoBody)) return 'noContent'
  if (successSchemas.some(isBlobResponse)) return 'blob'
  if (successSchemas.some(isTextResponse)) return 'text'
  return 'json'
}

type BaseRequest = ReturnType<typeof buildBaseRequest>

function buildBaseRequest(
  routeContract: RouteContract,
  // biome-ignore lint/suspicious/noExplicitAny: params shape depends on contract
  anyParams: any,
  options: ContractRequestOptions<false, boolean>,
) {
  return {
    ...DEFAULT_OPTIONS,
    path: buildRequestPath(routeContract.pathResolver(anyParams.pathParams), anyParams.pathPrefix),
    method: routeContract.method.toUpperCase(),
    body: anyParams.body ? JSON.stringify(anyParams.body) : undefined,
    query: anyParams.queryParams,
    headers: copyWithoutUndefined({
      'x-request-id': options.reqContext?.reqId,
      ...anyParams.headers,
    }),
    reset: options.disableKeepAlive ?? false,
    ...(Object.hasOwn(options, 'timeout') && {
      bodyTimeout: options.timeout,
      headersTimeout: options.timeout,
    }),
    throwOnError: undefined,
  }
}

async function sendSseRequest(
  client: Client,
  baseRequest: BaseRequest,
  routeContract: RouteContract,
  retryConfig: RetryConfig,
  requestLabel: string,
) {
  const result = await sendWithRetryReturnStream(
    client,
    { ...baseRequest, headers: { ...baseRequest.headers, accept: 'text/event-stream' } },
    retryConfig,
    { throwOnInternalError: false, requestLabel },
  )
  if (result.error) {
    throw isRequestResult(result.error)
      ? new ResponseStatusError(result.error, requestLabel)
      : result.error
  }
  return parseSseStream(result.result.body, getSseSchemaByEventName(routeContract))
}

async function sendNonSseRequest(
  client: Client,
  baseRequest: BaseRequest,
  routeContract: RouteContract,
  nonSseMode: string,
  retryConfig: RetryConfig,
  options: ContractRequestOptions<false, boolean>,
) {
  const throwOnError = options.throwOnError ?? DEFAULT_OPTIONS.throwOnError

  const result = await sendWithRetry(client, baseRequest, retryConfig, {
    safeParseJson: nonSseMode === 'text',
    blobBody: nonSseMode === 'blob',
    throwOnInternalError: false,
    requestLabel: options.requestLabel,
  })

  if (result.error && throwOnError) {
    throw isRequestResult(result.error)
      ? new ResponseStatusError(result.error, options.requestLabel)
      : result.error
  }

  if (result.result) {
    if (nonSseMode === 'noContent') {
      // biome-ignore lint/suspicious/noExplicitAny: null body for 204
      ;(result.result as any).body = null
    } else if (
      nonSseMode === 'json' &&
      (options.validateResponse ?? DEFAULT_OPTIONS.validateResponse)
    ) {
      const responseSchema = getSuccessResponseSchema(routeContract)
      if (responseSchema) {
        result.result.body = responseSchema.parse(result.result.body)
      }
    }
  }

  return result
}

export function sendByRouteContract<
  const Contract extends RouteContract,
  IsStreaming extends boolean = false,
  DoThrowOnError extends boolean = DEFAULT_THROW_ON_ERROR,
>(
  client: Client,
  routeContract: Contract,
  params: PayloadRouteRequestParams<
    InferSchemaInput<Contract['requestPathParamsSchema']>,
    InferSchemaInput<ExtractRequestBody<Contract>>,
    InferSchemaInput<Contract['requestQuerySchema']>,
    InferSchemaInput<Contract['requestHeaderSchema']>
  > &
    StreamingParam<Contract['responseSchemasByStatusCode'], IsStreaming>,
  options: ContractRequestOptions<false, DoThrowOnError>,
): Promise<
  ReturnTypeForContract<Contract['responseSchemasByStatusCode'], IsStreaming, DoThrowOnError>
> {
  // biome-ignore lint/suspicious/noExplicitAny: params shape depends on contract
  const anyParams = params as any
  const useStreaming: boolean =
    anyParams.streaming ?? getSseSchemaByEventName(routeContract) !== null
  const retryConfig = options.retryConfig ?? NO_RETRY_CONFIG
  const baseRequest = buildBaseRequest(routeContract, anyParams, options)

  if (useStreaming) {
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from IsStreaming
    return sendSseRequest(
      client,
      baseRequest,
      routeContract,
      retryConfig,
      options.requestLabel,
    ) as any
  }

  // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from IsStreaming
  return sendNonSseRequest(
    client,
    baseRequest,
    routeContract,
    deriveNonSseMode(routeContract),
    retryConfig,
    options,
  ) as any
}
