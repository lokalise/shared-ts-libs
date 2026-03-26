import type { Readable } from 'node:stream'
import {
  type AvailableResponseModes,
  buildRequestPath,
  ContractNoBody,
  getSseSchemaByEventName,
  type HasAnySseSuccessResponse,
  type HttpStatusCode,
  type InferNonSseSuccessResponses,
  type InferSchemaInput,
  type InferSseSuccessResponses,
  type IsNoBodySuccessResponse,
  isAnyOfResponses,
  isBlobResponse,
  isSseResponse,
  isTextResponse,
  type ResponseSchemasByStatusCode,
  type RouteContract,
  type RouteContractResponse,
  type SseEventOf,
  type SseSchemaByEventName,
  type TypedRouteContractResponse,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import type { Client, Dispatcher } from 'undici'
import {
  isRequestResult,
  NO_RETRY_CONFIG,
  type RequestResult,
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
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      data = line.slice(5).trim()
    }
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

// ---------------------------------------------------------------------------
// Response resolution: status code + content-type → how to parse the body
// ---------------------------------------------------------------------------

type ResolvedEntry =
  | { kind: 'noContent' }
  | { kind: 'text' }
  | { kind: 'blob' }
  | { kind: 'json'; schema: z.ZodType }
  | { kind: 'sse'; schemaByEventName: SseSchemaByEventName }

function matchTypedResponse(
  entry: TypedRouteContractResponse,
  contentType: string,
): ResolvedEntry | null {
  if (isTextResponse(entry)) {
    return contentType.includes(entry.contentType) ? { kind: 'text' } : null
  }

  if (isBlobResponse(entry)) {
    return contentType.includes(entry.contentType) ? { kind: 'blob' } : null
  }

  if (isSseResponse(entry)) {
    return contentType.includes('text/event-stream')
      ? { kind: 'sse', schemaByEventName: entry.schemaByEventName }
      : null
  }

  if (contentType.includes('application/json')) {
    return { kind: 'json', schema: entry }
  }

  return null
}

function resolveEntry(
  schemaEntry: RouteContractResponse,
  contentType: string | undefined,
): ResolvedEntry | null {
  if (schemaEntry === ContractNoBody) {
    return { kind: 'noContent' }
  }

  if (!contentType) {
    return null
  }

  if (isAnyOfResponses(schemaEntry)) {
    for (const item of schemaEntry.responses) {
      const resolvedEntry = matchTypedResponse(item, contentType)

      if (resolvedEntry) {
        return resolvedEntry
      }
    }
  } else {
    const resolvedEntry = matchTypedResponse(schemaEntry, contentType)

    if (resolvedEntry) {
      return resolvedEntry
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

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

async function parseBody(
  result: RequestResult<Dispatcher.ResponseData['body']>,
  resolvedEntry: ResolvedEntry,
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

export async function sendByRouteContract<
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

  const throwOnError = (options.throwOnError ?? DEFAULT_OPTIONS.throwOnError) || useStreaming
  const retryConfig = options.retryConfig ?? NO_RETRY_CONFIG

  const baseRequest = buildBaseRequest(routeContract, anyParams, options)

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
    routeContract.responseSchemasByStatusCode[sendOutput.result.statusCode as HttpStatusCode]

  if (!responseSchemas) {
    await sendOutput.result.body.dump()
    throw new Error('Could not map response statusCode')
  }

  const rawContentType = sendOutput.result.headers['content-type']
  const contentType = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType

  const resolvedEntry = resolveEntry(responseSchemas, contentType)

  if (!resolvedEntry) {
    await sendOutput.result.body.dump()
    throw new Error(`Could not resolver response contentType "${contentType}"`)
  }

  const body = await parseBody(sendOutput.result, resolvedEntry, request.validateResponse)

  return {
    result: {
      ...sendOutput.result,
      body,
    },
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from IsStreaming
  } as any
}
