import type { Readable } from 'node:stream'
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
import type { Client, Dispatcher } from 'undici'
import {
  type Either,
  type InternalRequestError,
  isRequestResult,
  NO_RETRY_CONFIG,
  type RequestResult,
  sendWithRetryReturnStream,
} from 'undici-retry'
import type { ContractRequestOptions } from './types.ts'

type ReturnTypeForContract<TApiContract extends ApiContract, TIsStreaming extends boolean> = Either<
  RequestResult<unknown> | InternalRequestError,
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

const resolveHeaders = <T>(headers: HeadersParam<T>): T | Promise<T> => {
  return typeof headers === 'function' ? (headers as () => T | Promise<T>)() : headers
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
>(
  client: Client,
  routeContract: TApiContract,
  params: ClientRequestParams<TApiContract, TIsStreaming>,
  options: ContractRequestOptions,
): Promise<ReturnTypeForContract<TApiContract, TIsStreaming>> {
  const useStreaming: boolean = params.streaming ?? hasAnySuccessSseResponse(routeContract)

  const validateResponse = options.validateResponse ?? true
  const strictContentType = options.strictContentType ?? true
  const retryConfig = options.retryConfig ?? NO_RETRY_CONFIG

  const resolvedHeaders = (await resolveHeaders(params.headers)) ?? {}

  const request = {
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
  } satisfies Dispatcher.RequestOptions

  const sendOutput = await sendWithRetryReturnStream(client, request, retryConfig, {
    throwOnInternalError: false,
    requestLabel: options.requestLabel,
  })

  if (sendOutput.error) {
    if (!isRequestResult(sendOutput.error)) {
      throw sendOutput.error
    }

    // Non-2xx HTTP response mapped to Either.error
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from TIsStreaming
    return { error: sendOutput.error, result: undefined } as any
  }

  return resolveAndParseResponse(
    sendOutput.result,
    routeContract,
    validateResponse,
    strictContentType,
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
  const rawHeaders = result.headers
  const headers = routeContract.responseHeaderSchema
    ? { ...rawHeaders, ...routeContract.responseHeaderSchema.parse(rawHeaders) }
    : rawHeaders

  return {
    result: { body, statusCode: result.statusCode, headers },
    // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from IsStreaming
  } as any
}
