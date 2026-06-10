import { randomUUID } from 'node:crypto'
import {
  type ApiContract,
  type ApiContractResponse,
  ContractNoBody,
  getSseSchemaByEventName,
  type HttpStatusCode,
  hasAnySuccessSseResponse,
  isAnyOfResponses,
  isBlobResponse,
  isJsonResponse,
  isTextResponse,
  mapApiContractToPath,
  type SseSchemaByEventName,
} from '@lokalise/api-contracts'
import { InternalError } from '@lokalise/node-core'
import type { FastifyReply, FastifyRequest, FastifySchema, RouteOptions } from 'fastify'
import type { z } from 'zod/v4'
import type { ApiRouteOptions, InferApiHandler } from './apiHandlerTypes.ts'
import type {
  SSEContext,
  SSESession,
  SSESessionMode,
  SSEStartOptions,
  SSEStreamMessage,
} from './sseTypes.ts'

function buildSSERouteConfig(
  options: ApiRouteOptions | undefined,
): true | { serializer?: (data: unknown) => string; heartbeatInterval?: number } {
  if (!options?.serializer && options?.heartbeatInterval === undefined) {
    return true
  }

  const sseConfig: { serializer?: (data: unknown) => string; heartbeatInterval?: number } = {}

  if (options.serializer) {
    sseConfig.serializer = options.serializer
  }
  if (options.heartbeatInterval !== undefined) {
    sseConfig.heartbeatInterval = options.heartbeatInterval
  }

  return sseConfig
}

function validateApiResponseHeaders(contract: ApiContract, reply: FastifyReply): void {
  const schema = contract.responseHeaderSchema
  if (!schema) {
    return
  }

  const result = schema.safeParse(reply.getHeaders())
  if (!result.success) {
    throw new InternalError({
      message: 'Internal Server Error',
      errorCode: 'RESPONSE_HEADERS_VALIDATION_FAILED',
      details: { validationError: result.error.message },
    })
  }
}

type StatusBody = { status: number; body: unknown }

function isStatusBodyResult(value: unknown): value is StatusBody {
  return typeof value === 'object' && value !== null && 'status' in value
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

/**
 * Look up the `content-type` a contract declares for a `textResponse`/`blobResponse` at a
 * given status code (directly or inside an `anyOfResponses`). Used to set the response
 * header so the client can match the body kind. Returns `undefined` for JSON/unknown entries.
 */
function getDeclaredContentType(contract: ApiContract, status: number): string | undefined {
  const entry = contract.responsesByStatusCode[status as HttpStatusCode]
  if (!entry) {
    return undefined
  }
  const candidates: ApiContractResponse[] = isAnyOfResponses(entry) ? entry.responses : [entry]
  for (const candidate of candidates) {
    if (isTextResponse(candidate) || isBlobResponse(candidate)) {
      return candidate.contentType
    }
  }
  return undefined
}

/**
 * Send a `{ status, body }` HTTP response, shared by the non-SSE path and the non-streaming
 * branch of an SSE-capable handler.
 *
 * The body is passed to Fastify as-is — a `string`, `Buffer` or `Readable` stream is sent
 * natively, everything else is serialized as JSON. The `content-type` (unless the handler
 * already set one) comes from the contract: a `textResponse`/`blobResponse` entry's declared
 * type, otherwise `application/json`.
 */
async function sendResponse(
  contract: ApiContract,
  reply: FastifyReply,
  status: number,
  body: unknown,
): Promise<void> {
  const existing = reply.getHeader('content-type')
  // Set the content-type when none is present, or replace the SSE route config's pre-set
  // `text/event-stream` for an early non-streaming response.
  if (existing === undefined || String(existing).includes('text/event-stream')) {
    reply.type(getDeclaredContentType(contract, status) ?? 'application/json')
  }

  // Response body validation is handled by the `fastify-type-provider-zod` serializer
  // compiler (a required dependency), which throws a 500 when the body doesn't match the
  // contract's response schema for this status code. Response headers are not covered by
  // the serializer, so they are validated explicitly here.
  validateApiResponseHeaders(contract, reply)

  if (reply.sent) {
    return
  }

  await reply.code(status).send(body)
}

// ============================================================================
// Internal Helpers — SSE Route (no controller, uses reply.sse directly)
// ============================================================================

function buildApiSSEContext(
  request: FastifyRequest,
  reply: FastifyReply,
  eventSchemas: SseSchemaByEventName,
  options: ApiRouteOptions | undefined,
): {
  // biome-ignore lint/suspicious/noExplicitAny: SSE event schemas are contract-specific, cast at call site
  sseContext: SSEContext<any>
  isStarted: () => boolean
  markHandlerDone: () => void
} {
  let started = false
  let sessionMode: SSESessionMode | undefined
  let closedByServer = false

  const sseContext: SSEContext = {
    start: <Context = unknown>(mode: SSESessionMode, startOptions?: SSEStartOptions<Context>) => {
      started = true
      sessionMode = mode

      if (mode === 'keepAlive') {
        reply.sse.keepAlive()
      }

      // sendHeaders() calls writeHead(200) but only queues headers in the buffer.
      // flushHeaders() forces them onto the wire so the client's fetch() returns.
      reply.sse.sendHeaders()
      reply.raw.flushHeaders()

      const connectionId = randomUUID()

      const send = async (
        eventName: string,
        data: unknown,
        sendOptions?: { id?: string; retry?: number },
      ): Promise<boolean> => {
        const schema = eventSchemas[eventName]
        if (schema) {
          const result = schema.safeParse(data)
          if (!result.success) {
            throw new InternalError({
              message: `SSE event validation failed for event "${eventName}": ${result.error.message}`,
              errorCode: 'RESPONSE_VALIDATION_FAILED',
            })
          }
        }
        try {
          await reply.sse.send({
            event: eventName,
            data,
            id: sendOptions?.id,
            retry: sendOptions?.retry,
          })
          return true
        } catch {
          return false
        }
      }

      const session: SSESession<typeof eventSchemas, Context> = {
        id: connectionId,
        request,
        reply,
        context: startOptions?.context,
        connectedAt: new Date(),
        send,
        isConnected: () => reply.sse.isConnected,
        getStream: () => reply.sse.stream(),
        sendStream: async (messages: AsyncIterable<SSEStreamMessage>) => {
          for await (const message of messages) {
            await send(message.event, message.data, { id: message.id, retry: message.retry })
          }
        },
        close: () => {
          closedByServer = true
          reply.sse.close()
        },
      }

      if (options?.onConnect) {
        void Promise.resolve(options.onConnect(session)).catch(() => {})
      }

      if (options?.onClose) {
        const onClose = options.onClose
        reply.sse.onClose(() => {
          void Promise.resolve(onClose(session, closedByServer ? 'server' : 'client')).catch(
            () => {},
          )
        })
      }

      if (options?.onReconnect && reply.sse.lastEventId) {
        const onReconnect = options.onReconnect
        const lastEventId = reply.sse.lastEventId
        void reply.sse.replay(async () => {
          const replay = await onReconnect(session, lastEventId)
          if (replay) {
            for await (const msg of replay) {
              await reply.sse.send(msg)
            }
          }
        })
      }

      return session
    },

    reply,
  }

  return {
    sseContext,
    isStarted: () => started,
    // An autoClose session is closed by @fastify/sse when the handler completes — that close
    // is server-initiated. Called after the handler resolves, before the close fires; if the
    // client already disconnected mid-stream, onClose has fired with 'client' and this is moot.
    markHandlerDone: () => {
      if (sessionMode === 'autoClose') {
        closedByServer = true
      }
    },
  }
}

type HandleApiRouteParams = {
  contract: ApiContract
  // biome-ignore lint/suspicious/noExplicitAny: Handler types are validated by InferApiHandler at call site
  handler: (request: FastifyRequest, reply: FastifyReply, sse?: any) => any
  eventSchemas: SseSchemaByEventName
  options: ApiRouteOptions | undefined
  sseCapable: boolean
  request: FastifyRequest
  reply: FastifyReply
}

async function handleApiRoute({
  contract,
  handler,
  eventSchemas,
  options,
  sseCapable,
  request,
  reply,
}: HandleApiRouteParams): Promise<void> {
  const apiSSEContext = sseCapable
    ? buildApiSSEContext(request, reply, eventSchemas, options)
    : undefined

  const result = await handler(request, reply, apiSSEContext?.sseContext)

  if (apiSSEContext?.isStarted()) {
    // The handler drove the session imperatively via sse.start(); @fastify/sse manages
    // the rest of the connection lifecycle.
    apiSSEContext.markHandlerDone()
    return
  }

  if (isStatusBodyResult(result)) {
    // An SSE response carries an async iterable of events as its body: open the connection
    // and pipe each event (validated against the contract's event schemas).
    if (apiSSEContext && isAsyncIterable(result.body)) {
      const session = apiSSEContext.sseContext.start('autoClose')
      await session.sendStream(result.body as AsyncIterable<SSEStreamMessage>)
      apiSSEContext.markHandlerDone()
      return
    }
    // Any other status/body is sent as a regular HTTP response.
    await sendResponse(contract, reply, result.status, result.body)
    return
  }

  throw new Error(
    'Handler must return { status, body } or call sse.start(). Handler returned without doing either.',
  )
}

function buildResponseSchemas(contract: ApiContract): Record<string, z.ZodType> {
  const schemas: Record<string, z.ZodType> = {}

  for (const [statusCode, entry] of Object.entries(contract.responsesByStatusCode)) {
    const schema = isJsonResponse(entry)
      ? entry
      : isAnyOfResponses(entry)
        ? entry.responses.find(isJsonResponse)
        : undefined

    if (schema) {
      schemas[statusCode] = schema
    }
  }

  return schemas
}

function buildFastifySchema(contract: ApiContract): FastifySchema {
  const schema: FastifySchema = {}
  if (contract.requestPathParamsSchema) {
    schema.params = contract.requestPathParamsSchema
  }
  if (contract.requestQuerySchema) {
    schema.querystring = contract.requestQuerySchema
  }
  if (contract.requestHeaderSchema) {
    schema.headers = contract.requestHeaderSchema
  }
  if (contract.requestBodySchema !== undefined && contract.requestBodySchema !== ContractNoBody) {
    schema.body = contract.requestBodySchema
  }

  schema.response = buildResponseSchemas(contract)

  return schema
}

/**
 * Type-only helper to define a handler separately from the route, with the
 * request/reply types inferred from the contract.
 *
 * Returns the handler unchanged at runtime — it exists purely to attach the
 * contract-derived {@link InferApiHandler} type to a standalone handler.
 *
 * @example
 * ```typescript
 * const getUser = buildFastifyApiRouteHandler(getUserContract, async (request) => ({
 *   status: 200,
 *   body: await userService.findById(request.params.userId),
 * }))
 *
 * const route = buildFastifyApiRoute(getUserContract, getUser)
 * ```
 */
export function buildFastifyApiRouteHandler<Contract extends ApiContract>(
  _contract: Contract,
  handler: InferApiHandler<Contract>,
): InferApiHandler<Contract> {
  return handler
}

/**
 * Build a Fastify `RouteOptions` object from an `ApiContract` + handler.
 *
 * The handler shape is inferred from the contract's response mode:
 * - non-SSE contracts — `(request, reply) => { status, body }`
 * - contracts with any SSE response — `(request, reply, sse) => { status, body } | stream`,
 *   where the single handler runs shared logic once and then either returns a non-SSE
 *   `{ status, body }` response or calls `sse.start(...)` to stream.
 *
 * The optional `options` argument carries:
 * - any Fastify route field (`preHandler`, `onRequest`, `config`, `bodyLimit`, …)
 *   minus the ones the contract provides (`method`, `url`, `schema`, `handler`, `sse`),
 * - SSE lifecycle hooks (`onConnect`, `onClose`, `onReconnect`, `serializer`,
 *   `heartbeatInterval`) — applied only for contracts that declare an SSE response.
 *
 * @returns Fastify `RouteOptions` ready to pass to `app.route()`
 */
export function buildFastifyApiRoute<Contract extends ApiContract>(
  contract: Contract,
  apiHandler: InferApiHandler<Contract>,
  options?: ApiRouteOptions,
): RouteOptions {
  // Separate SSE-specific options (not part of Fastify RouteOptions) from the
  // passthrough options spread directly onto the route.
  const {
    contractMetadataToRouteMapper,
    serializer: _serializer,
    heartbeatInterval: _heartbeatInterval,
    onConnect: _onConnect,
    onClose: _onClose,
    onReconnect: _onReconnect,
    ...fastifyOptions
  } = options ?? {}

  const eventSchemas = getSseSchemaByEventName(contract) ?? {}
  const contractMetadata = contractMetadataToRouteMapper?.(contract.metadata) ?? {}
  const sseCapable = hasAnySuccessSseResponse(contract)

  return {
    ...fastifyOptions,
    ...contractMetadata,
    method: contract.method,
    url: mapApiContractToPath(contract),
    // `sse` is only set for SSE-capable contracts; non-SSE routes must not carry it.
    ...(sseCapable ? { sse: buildSSERouteConfig(options) } : {}),
    schema: buildFastifySchema(contract),
    handler: async (request, reply) =>
      handleApiRoute({
        contract,
        // biome-ignore lint/suspicious/noExplicitAny: Handler types are validated by InferApiHandler at call site
        handler: apiHandler as any,
        eventSchemas,
        options,
        sseCapable,
        request,
        reply,
      }),
  }
}
