import type {
  AnyDualModeContractDefinition,
  AnySSEContractDefinition,
  SSEEventSchemas,
} from '@lokalise/api-contracts'
import { buildRequestPath } from '@lokalise/api-contracts'
import type { z } from 'zod/v4'
import type { HeadersObject, HeadersSource, WretchInstance } from './types.ts'
import { parseRequestBody } from './utils/bodyUtils.ts'
import { isFailure } from './utils/either.ts'
import { parseQueryParams } from './utils/queryUtils.ts'
import { parseSseStream } from './utils/sseUtils.ts'

export type SseConnection = {
  close: () => void
}

export type SseCallbacks<Events extends SSEEventSchemas> = {
  onEvent: {
    [K in keyof Events & string]: (data: z.infer<Events[K]>) => void
  }
  onError?: (error: Error) => void
  onOpen?: () => void
}

type AnyContract = AnyDualModeContractDefinition | AnySSEContractDefinition

// Resolves the input type for a schema field, handling optional properties (T | undefined)
// and filtering out unspecified schemas that default to z.ZodTypeAny
type ResolveSchemaInput<S> =
  // biome-ignore lint/suspicious/noExplicitAny: Needed for mutual assignability check
  NonNullable<S> extends z.ZodTypeAny<any, any>
    ? // biome-ignore lint/suspicious/noExplicitAny: Needed for mutual assignability check
      z.ZodTypeAny<any, any> extends NonNullable<S>
      ? never // Schema is exactly z.ZodTypeAny — was not specified
      : z.input<NonNullable<S> & z.ZodTypeAny>
    : never

export type SseRouteRequestParams<Contract extends AnyContract> = {
  pathParams: ResolveSchemaInput<Contract['requestPathParamsSchema']>
  queryParams: ResolveSchemaInput<Contract['requestQuerySchema']>
  body: ResolveSchemaInput<Contract['requestBodySchema']>
  headers: ResolveSchemaInput<Contract['requestHeaderSchema']> extends never
    ? never
    :
        | ResolveSchemaInput<Contract['requestHeaderSchema']>
        | (() => ResolveSchemaInput<Contract['requestHeaderSchema']>)
        | (() => Promise<ResolveSchemaInput<Contract['requestHeaderSchema']>>)
  pathPrefix?: string
} extends infer Mandatory
  ? { [K in keyof Mandatory as Mandatory[K] extends never ? never : K]: Mandatory[K] }
  : never

function resolveHeaders(headers: HeadersSource): HeadersObject | Promise<HeadersObject> {
  return typeof headers === 'function' ? headers() : headers
}

type SseInternalParams = {
  pathParams?: unknown
  queryParams?: unknown
  body?: unknown
  headers?: HeadersSource
  pathPrefix?: string
}

async function fetchSseResponse(
  wretch: WretchInstance,
  contract: AnyContract,
  sseParams: SseInternalParams,
  queryString: string,
  abortController: AbortController,
): Promise<Response> {
  const resolvedHeaders = await resolveHeaders((sseParams.headers as HeadersSource) ?? {})

  const sseHeaders = {
    ...resolvedHeaders,
    Accept: 'text/event-stream',
    'Cache-Control': 'no-cache',
  }

  const path =
    buildRequestPath(contract.pathResolver(sseParams.pathParams), sseParams.pathPrefix) +
    queryString

  const method = contract.method

  if (method === 'get') {
    return wretch.headers(sseHeaders).options({ signal: abortController.signal }).get(path).res()
  }

  return wretch
    .headers(sseHeaders)
    .options({ signal: abortController.signal })
    [method](sseParams.body, path)
    .res()
}

function handleSseEvent(
  event: string,
  data: string,
  contract: AnyContract,
  callbacks: SseCallbacks<SSEEventSchemas>,
): void {
  if (!(event in contract.serverSentEventSchemas)) return

  try {
    const parsed = JSON.parse(data)
    const schema = contract.serverSentEventSchemas[event]
    /* v8 ignore start */
    if (!schema) return
    /* v8 ignore stop */
    const result = schema.safeParse(parsed)

    if (!result.success) {
      callbacks.onError?.(
        new Error(`Validation failed for event "${event}": ${result.error.message}`),
      )
      return
    }

    const handler = (callbacks.onEvent as Record<string, (data: unknown) => void>)[event]
    handler?.(result.data)
  } catch (err) {
    /* v8 ignore start */
    const message = err instanceof Error ? err.message : String(err)
    /* v8 ignore stop */
    callbacks.onError?.(new Error(`Failed to parse event data for "${event}": ${message}`))
  }
}

async function runSseConnection(
  wretch: WretchInstance,
  contract: AnyContract,
  sseParams: SseInternalParams,
  queryString: string,
  abortController: AbortController,
  callbacks: SseCallbacks<SSEEventSchemas>,
): Promise<void> {
  try {
    const response = await fetchSseResponse(
      wretch,
      contract,
      sseParams,
      queryString,
      abortController,
    )

    callbacks.onOpen?.()

    /* v8 ignore start */
    if (!response.body) {
      throw new Error('Response body is null')
    }
    /* v8 ignore stop */
    const reader = response.body.getReader()

    for await (const { event, data } of parseSseStream(reader, abortController.signal)) {
      /* v8 ignore start */
      if (abortController.signal.aborted) break
      /* v8 ignore stop */
      handleSseEvent(event, data, contract, callbacks)
    }
  } catch (err) {
    /* v8 ignore start */
    if (!abortController.signal.aborted) {
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
    /* v8 ignore stop */
  }
}

/**
 * Connects to a server-sent event (SSE) stream defined by a contract and dispatches typed events
 * to the provided callbacks.
 *
 * The connection is established immediately and runs asynchronously in the background. Events are
 * validated against the contract's schemas before being passed to handlers. The stream runs until
 * the server closes it or `close()` is called — there is no automatic reconnection.
 *
 * @param wretch - A configured wretch instance (base URL, default headers, etc.)
 * @param contract - The SSE or dual-mode contract defining the endpoint and event schemas
 * @param params - Path params, query params, body, and headers required by the contract
 * @param callbacks - `onEvent` handlers keyed by event name, plus optional `onOpen` and `onError`
 * @returns A `SseConnection` with a `close()` method to abort the stream
 *
 * @example
 * const connection = connectSseByContract(client, myContract, { pathParams: { id: '1' } }, {
 *   onEvent: { 'item.updated': (data) => console.log(data) },
 *   onError: (err) => console.error(err),
 * })
 * // later:
 * connection.close()
 */
export function connectSseByContract<
  Contract extends AnyContract,
  Events extends SSEEventSchemas = Contract['serverSentEventSchemas'],
>(
  wretch: WretchInstance,
  contract: Contract,
  params: SseRouteRequestParams<Contract>,
  callbacks: SseCallbacks<Events>,
): SseConnection {
  const abortController = new AbortController()

  const sseParams = params as SseInternalParams

  // Validate query params
  const queryParams = parseQueryParams({
    queryParams: sseParams.queryParams,
    queryParamsSchema: contract.requestQuerySchema,
    path: contract.pathResolver(sseParams.pathParams),
  })

  if (isFailure(queryParams)) {
    callbacks.onError?.(new Error(`Query params validation failed: ${queryParams.error.message}`))
    return { close: () => {} }
  }

  // Validate request body
  if (contract.requestBodySchema) {
    const body = parseRequestBody({
      body: sseParams.body,
      requestBodySchema: contract.requestBodySchema,
      path: contract.pathResolver(sseParams.pathParams),
    })

    if (isFailure(body)) {
      callbacks.onError?.(new Error(`Request body validation failed: ${body.error.message}`))
      return { close: () => {} }
    }
  }

  // Start async connection
  void runSseConnection(wretch, contract, sseParams, queryParams.result, abortController, callbacks)

  return {
    close: () => abortController.abort(),
  }
}
