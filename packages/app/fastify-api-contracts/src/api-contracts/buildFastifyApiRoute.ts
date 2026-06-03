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
  isSseResponse,
  isTextResponse,
  mapApiContractToPath,
  type SseSchemaByEventName,
  SUCCESSFUL_HTTP_STATUS_CODES,
} from '@lokalise/api-contracts'
import { InternalError } from '@lokalise/node-core'
import type { FastifyReply, RouteOptions } from 'fastify'
import type { z } from 'zod/v4'
import type { ApiRouteOptions, InferApiHandler } from './apiHandlerTypes.ts'
import type {
  SSEContext,
  SSESession,
  SSESessionMode,
  SSEStartOptions,
  SSEStreamMessage,
  SyncModeReply,
} from './sseTypes.ts'
import { determineMode, hasHttpStatusCode, isErrorLike, type SSEReply } from './sseUtils.ts'

// ============================================================================
// Internal Helpers — Response Mode
// ============================================================================

type ResponseMode = 'non-sse' | 'sse' | 'dual'

function isSuccessResponseDual(value: ApiContractResponse): boolean {
  if (value === ContractNoBody || isTextResponse(value) || isBlobResponse(value)) return true
  if (!isSseResponse(value) && !isAnyOfResponses(value)) return true
  if (isAnyOfResponses(value)) {
    return value.responses.some((response: ApiContractResponse) => !isSseResponse(response))
  }
  return false
}

function getContractResponseMode(contract: ApiContract): ResponseMode {
  if (!hasAnySuccessSseResponse(contract)) return 'non-sse'
  for (const code of SUCCESSFUL_HTTP_STATUS_CODES) {
    const value = contract.responsesByStatusCode[code]
    if (value && isSuccessResponseDual(value)) return 'dual'
  }
  return 'sse'
}

function buildSSERouteConfig(
  options: ApiRouteOptions | undefined,
): true | { serializer?: (data: unknown) => string; heartbeatInterval?: number } {
  if (!options?.serializer && options?.heartbeatInterval === undefined) return true
  const sseConfig: { serializer?: (data: unknown) => string; heartbeatInterval?: number } = {}
  if (options.serializer) sseConfig.serializer = options.serializer
  if (options.heartbeatInterval !== undefined)
    sseConfig.heartbeatInterval = options.heartbeatInterval
  return sseConfig
}

// ============================================================================
// Internal Helpers — Sync Route
// ============================================================================

function getSchemaForStatusCode(contract: ApiContract, status: number): z.ZodType | null {
  const entry = contract.responsesByStatusCode[status as HttpStatusCode]

  if (!entry) {
    return null
  }

  // `isJsonResponse` is true only for a plain Zod schema; `ContractNoBody`,
  // `textResponse`, `blobResponse` and `sseResponse` entries all resolve to `false`.
  if (isAnyOfResponses(entry)) {
    for (const anyResponse of entry.responses) {
      if (isJsonResponse(anyResponse)) {
        return anyResponse
      }
    }

    return null
  }

  return isJsonResponse(entry) ? entry : null
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

type MaybePromise<T> = T | Promise<T>

async function handleApiSyncRoute(
  contract: ApiContract,
  // biome-ignore lint/suspicious/noExplicitAny: Handler types are validated by InferApiHandler at the call site
  handler: (request: any, reply: SyncModeReply) => MaybePromise<{ status: number; body: unknown }>,
  // biome-ignore lint/suspicious/noExplicitAny: Request types are validated by Fastify schema
  request: any,
  reply: FastifyReply,
): Promise<void> {
  const { status, body } = await handler(request, reply as SyncModeReply)

  if (reply.sent) {
    request.log.warn({
      msg: 'Sync handler sent response directly, bypassing response validation',
      tag: 'response_sent_directly',
      method: request.method,
      url: request.url,
    })
    return
  }

  const schema = getSchemaForStatusCode(contract, status)
  if (schema) {
    const result = schema.safeParse(body)
    if (!result.success) {
      throw new InternalError({
        message: 'Internal Server Error',
        errorCode: 'RESPONSE_VALIDATION_FAILED',
        details: { validationError: result.error.message },
      })
    }
  }

  validateApiResponseHeaders(contract, reply)

  if (!reply.hasHeader('content-type')) {
    reply.type('application/json')
  }

  await reply.code(status).send(body)
}

// ============================================================================
// Internal Helpers — SSE Route (no controller, uses reply.sse directly)
// ============================================================================

function buildApiSSEContext(
  // biome-ignore lint/suspicious/noExplicitAny: Request types are validated by Fastify schema
  request: any,
  reply: FastifyReply,
  eventSchemas: SseSchemaByEventName,
  options: ApiRouteOptions | undefined,
): {
  // biome-ignore lint/suspicious/noExplicitAny: SSE event schemas are contract-specific, cast at call site
  sseContext: SSEContext<any>
  isStarted: () => boolean
  hasResponse: () => boolean
  getResponseData: () => { code: number; body: unknown } | undefined
} {
  let started = false
  let responseData: { code: number; body: unknown } | undefined
  const sseReply = reply as SSEReply

  const sseContext: SSEContext = {
    start: <Context = unknown>(mode: SSESessionMode, startOptions?: SSEStartOptions<Context>) => {
      started = true

      if (mode === 'keepAlive') {
        sseReply.sse.keepAlive()
      }

      // sendHeaders() calls writeHead(200) but only queues headers in the buffer.
      // flushHeaders() forces them onto the wire so the client's fetch() returns.
      sseReply.sse.sendHeaders()
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
          await sseReply.sse.send({
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
        context: (startOptions?.context ?? {}) as Context,
        connectedAt: new Date(),
        // biome-ignore lint/suspicious/noExplicitAny: SSEEventSender generic is satisfied at handler call site
        send: send as any,
        isConnected: () => sseReply.sse.isConnected,
        getStream: () => sseReply.sse.stream(),
        sendStream: async (messages: AsyncIterable<SSEStreamMessage>) => {
          for await (const message of messages) {
            await send(message.event, message.data, { id: message.id, retry: message.retry })
          }
        },
        eventSchemas,
      }

      if (options?.onConnect) {
        void Promise.resolve(options.onConnect(session)).catch(() => {})
      }

      if (options?.onClose) {
        const onClose = options.onClose
        sseReply.sse.onClose(() => {
          void Promise.resolve(onClose(session, 'client')).catch(() => {})
        })
      }

      if (options?.onReconnect && sseReply.sse.lastEventId) {
        const onReconnect = options.onReconnect
        const lastEventId = sseReply.sse.lastEventId
        void sseReply.sse.replay(async () => {
          const replay = await onReconnect(session, lastEventId)
          if (replay) {
            for await (const msg of replay) {
              await sseReply.sse.send(msg)
            }
          }
        })
      }

      return session
    },

    respond: ((code: number, body: unknown) => {
      if (started) {
        throw new Error(
          'Cannot call sse.respond() after sse.start() — the SSE stream is already open.',
        )
      }
      responseData = { code, body }
      return { _type: 'respond' as const, code, body }
      // biome-ignore lint/suspicious/noExplicitAny: respond typing is enforced by contract at call site
    }) as any,

    sendHeaders: () => {
      sseReply.sse.sendHeaders()
    },

    reply,
  }

  return {
    sseContext,
    isStarted: () => started,
    hasResponse: () => responseData !== undefined,
    getResponseData: () => responseData,
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Core SSE handler coordinates context, error handling, and lifecycle
async function handleApiSseRoute(
  // biome-ignore lint/suspicious/noExplicitAny: SSE handler types are validated by InferApiHandler at call site
  sseHandler: (request: any, sse: any) => unknown,
  eventSchemas: SseSchemaByEventName,
  options: ApiRouteOptions | undefined,
  // biome-ignore lint/suspicious/noExplicitAny: Request types are validated by Fastify schema
  request: any,
  reply: FastifyReply,
): Promise<void> {
  const { sseContext, isStarted, hasResponse, getResponseData } = buildApiSSEContext(
    request,
    reply,
    eventSchemas,
    options,
  )

  try {
    await sseHandler(request, sseContext)

    if (!isStarted() && !hasResponse()) {
      throw new Error(
        'SSE handler must either send a response (sse.respond()) ' +
          'or start streaming (sse.start()). Handler returned without doing either.',
      )
    }

    const responseData = getResponseData()
    if (responseData) {
      // Early HTTP response (sse.respond() was called before streaming)
      reply.removeHeader('cache-control')
      reply.removeHeader('x-accel-buffering')
      reply.type('application/json').code(responseData.code).send(responseData.body)
    }
    // If started, @fastify/sse manages the rest of the connection lifecycle
  } catch (err) {
    if (isStarted()) {
      // Headers already sent — can't change status code; try to send error event
      const sseReply = reply as SSEReply
      if (sseReply.sse.isConnected) {
        try {
          await sseReply.sse.send({
            event: 'error',
            data: { message: isErrorLike(err) ? err.message : 'Internal Server Error' },
          })
        } catch {
          // Ignore send failures during error handling
        }
      }
      throw err
    }

    // Streaming not started — send HTTP error response
    const message = isErrorLike(err) ? err.message : 'Internal Server Error'
    const statusCode = hasHttpStatusCode(err) ? err.httpStatusCode : 500
    const statusText = statusCode >= 500 ? 'Internal Server Error' : 'Error'
    reply.code(statusCode).type('application/json').send({ statusCode, error: statusText, message })
  }
}

// ============================================================================
// Internal Helpers — Schema
// ============================================================================

function buildResponseSchemas(contract: ApiContract): Record<number, unknown> {
  return Object.keys(contract.responsesByStatusCode).reduce<Record<number, unknown>>(
    (acc, statusCode) => {
      const schema = getSchemaForStatusCode(contract, Number(statusCode))
      if (schema) {
        acc[Number(statusCode)] = schema
      }
      return acc
    },
    {},
  )
}

function buildBaseSchema(contract: ApiContract): Record<string, unknown> {
  const schema: Record<string, unknown> = {}
  if (contract.requestPathParamsSchema) schema.params = contract.requestPathParamsSchema
  if (contract.requestQuerySchema) schema.querystring = contract.requestQuerySchema
  if (contract.requestHeaderSchema) schema.headers = contract.requestHeaderSchema

  if (contract.requestBodySchema !== undefined && contract.requestBodySchema !== ContractNoBody) {
    schema.body = contract.requestBodySchema
  }

  schema.response = buildResponseSchemas(contract)

  return schema
}

// ============================================================================
// Public API
// ============================================================================

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
 * - `'non-sse'` — bare async function returning `{ status, body }`
 * - `'sse'`     — bare async function calling `sse.start(...)` / `sse.respond(...)`
 * - `'dual'`    — `{ nonSse, sse }` object branched by the `Accept` header
 *
 * The optional `options` argument carries:
 * - any Fastify route field (`preHandler`, `onRequest`, `config`, `bodyLimit`, …)
 *   minus the ones the contract provides (`method`, `url`, `schema`, `handler`, `sse`),
 * - SSE lifecycle hooks (`onConnect`, `onClose`, `onReconnect`, `serializer`,
 *   `heartbeatInterval`) — applied for `'sse'` and `'dual'` contracts only,
 * - `defaultMode` for `'dual'` contracts when the `Accept` header is ambiguous.
 *
 * @returns Fastify `RouteOptions` ready to pass to `app.route()`
 */
export function buildFastifyApiRoute<Contract extends ApiContract>(
  contract: Contract,
  handler: InferApiHandler<Contract>,
  options?: ApiRouteOptions,
): RouteOptions {
  // Separate SSE-specific options (not part of Fastify RouteOptions) from the
  // passthrough options spread directly onto the route.
  const {
    defaultMode,
    contractMetadataToRouteMapper,
    serializer: _serializer,
    heartbeatInterval: _heartbeatInterval,
    onConnect: _onConnect,
    onClose: _onClose,
    onReconnect: _onReconnect,
    logger: _logger,
    ...fastifyOptions
  } = options ?? {}

  const url = mapApiContractToPath(contract)
  const mode = getContractResponseMode(contract)
  const eventSchemas = getSseSchemaByEventName(contract) ?? {}
  const baseSchema = buildBaseSchema(contract)
  const contractMetadata = contractMetadataToRouteMapper?.(contract.metadata) ?? {}

  if (mode === 'non-sse') {
    // biome-ignore lint/suspicious/noExplicitAny: handler shape validated by InferApiHandler at call site
    const syncHandler = handler as any
    return {
      ...fastifyOptions,
      ...contractMetadata,
      method: contract.method,
      url,
      schema: baseSchema,
      handler: async (request, reply) => handleApiSyncRoute(contract, syncHandler, request, reply),
    }
  }

  if (mode === 'dual') {
    const resolvedDefaultMode = defaultMode ?? 'json'
    // biome-ignore lint/suspicious/noExplicitAny: handler shape validated by InferApiHandler at call site
    const dualHandlers = handler as any
    return {
      ...fastifyOptions,
      ...contractMetadata,
      method: contract.method,
      url,
      sse: buildSSERouteConfig(options),
      schema: baseSchema,
      handler: (request, reply) => {
        const responseMode = determineMode(request.headers.accept, resolvedDefaultMode)
        if (responseMode === 'json') {
          return handleApiSyncRoute(contract, dualHandlers.nonSse, request, reply)
        }
        return handleApiSseRoute(dualHandlers.sse, eventSchemas, options, request, reply)
      },
    }
  }

  // SSE-only
  // biome-ignore lint/suspicious/noExplicitAny: handler shape validated by InferApiHandler at call site
  const sseHandler = handler as any
  return {
    ...fastifyOptions,
    ...contractMetadata,
    method: contract.method,
    url,
    sse: buildSSERouteConfig(options),
    schema: baseSchema,
    handler: async (request, reply) =>
      handleApiSseRoute(sseHandler, eventSchemas, options, request, reply),
  }
}
