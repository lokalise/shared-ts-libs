import { randomUUID } from 'node:crypto'
import type { ResponseHeaderSchema, SseSchemaByEventName } from '@lokalise/api-contracts'
import { InternalError } from '@lokalise/node-core'
import type { FastifyReply, FastifyRequest } from 'fastify'
import Negotiator from 'negotiator'
import type {
  FastifySSERouteOptions,
  SSEContext,
  SSESession,
  SSESessionMode,
  SSEStartOptions,
  SSEStreamMessage,
} from './sseTypes.ts'

/**
 * Pick the response content-type the client prefers among the given candidates, based on the
 * request's `Accept` header. Negotiation (quality values, wildcards, specificity precedence)
 * is delegated to [negotiator](https://github.com/jshttp/negotiator); candidates earlier in
 * the list win ties (e.g. under a full wildcard).
 *
 * Returns `null` when the request carries no `Accept` header or none of the candidates
 * is acceptable — the caller decides the fallback.
 *
 * @param request - The Fastify request whose `Accept` header drives the negotiation
 * @param contentTypes - Candidate response content-types, in server preference order
 * @returns The preferred candidate, or `null` when there is no acceptable match
 */
export function determineResponseContentType<TContentType extends string>(
  request: FastifyRequest,
  contentTypes: readonly TContentType[],
): TContentType | null {
  // Without an Accept header the client expressed no preference — negotiator would treat
  // this as `*/*` and pick the first candidate, so bail out explicitly instead.
  if (!request.headers.accept) {
    return null
  }

  return (new Negotiator(request).mediaType([...contentTypes]) as TContentType | undefined) ?? null
}

/**
 * Validate the reply's headers against the contract's `responseHeaderSchema` (a no-op when
 * the contract declares none). Response headers are not covered by the
 * `fastify-type-provider-zod` serializer, so they are validated explicitly — before the
 * response goes out, while a violation can still surface as a 500.
 */
export function validateApiResponseHeaders(
  schema: ResponseHeaderSchema | undefined,
  reply: FastifyReply,
): void {
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

const kApiSseRuntime = Symbol('@lokalise/fastify-api-contracts/apiSseRuntime')

/**
 * The per-request SSE runtime this library attaches to the reply (the same way
 * `@fastify/sse` attaches `reply.sse`) — the route error path uses it instead of the raw
 * plugin API, so all server-initiated closes flow through one place and the `onClose`
 * hook's `'server' | 'client'` initiator stays a plain closure variable of
 * `buildApiSSEContext`.
 */
export type ApiSseRuntime = {
  /** True while the SSE stream is live. */
  isConnected: () => boolean
  /** Send the terminal `error` event carrying the resolved payload. */
  sendErrorEvent: (payload: unknown) => Promise<void>
  /** Close the stream as a server-initiated close. */
  close: () => void
}

type WithApiSseRuntime = { [kApiSseRuntime]?: ApiSseRuntime }

/** The SSE runtime of this request, present once `buildApiSSEContext` ran (SSE-capable routes only). */
export function getApiSseRuntime(reply: FastifyReply): ApiSseRuntime | undefined {
  return (reply as WithApiSseRuntime)[kApiSseRuntime]
}

/** Runtime shape of one SSE representation of the contract (the status key kept as its string form). */
export type SseRuntimeSelection = {
  statusCode: string
  contentType: string
  events: SseSchemaByEventName
}

/**
 * Pick the SSE representation a `start()` call selects. With a single declared
 * representation no selection is needed; with several, `{ statusCode, contentType }` is
 * required and resolved with the contract lookup precedence (exact status → range key →
 * `'default'`), so the session validates against exactly the selected event schemas
 * instead of a flattened merge across all representations.
 */
function resolveSseSelection(
  selections: SseRuntimeSelection[],
  startOptions: { statusCode?: number | string; contentType?: string } | undefined,
): SseRuntimeSelection {
  const [firstSelection] = selections
  if (!firstSelection) {
    throw new Error('Contract does not declare any SSE response.')
  }
  if (selections.length === 1) {
    return firstSelection
  }

  const { statusCode, contentType } = startOptions ?? {}
  if (statusCode === undefined || contentType === undefined) {
    throw new Error(
      'The contract declares several SSE representations — sse.start() requires { statusCode, contentType } to select which event schemas apply.',
    )
  }

  const exactKey = String(statusCode)
  const rangeKey =
    typeof statusCode === 'number' && statusCode >= 100 && statusCode < 600
      ? `${Math.floor(statusCode / 100)}xx`
      : undefined
  const match =
    selections.find((s) => s.statusCode === exactKey && s.contentType === contentType) ??
    (rangeKey
      ? selections.find((s) => s.statusCode === rangeKey && s.contentType === contentType)
      : undefined) ??
    selections.find((s) => s.statusCode === 'default' && s.contentType === contentType)

  if (!match) {
    throw new Error(
      `Contract does not declare an SSE response for status ${exactKey} and content-type "${contentType}".`,
    )
  }
  return match
}

/**
 * Build the `sse` context passed to SSE-capable handlers, plus the lifecycle probes the
 * route runtime needs (`isStarted`, `markHandlerDone`).
 *
 * `start()` validates the reply's headers against `responseHeaderSchema` before flushing
 * them — the only moment a violation can still become a 500 instead of going out on an
 * already-committed stream.
 */
export function buildApiSSEContext(
  request: FastifyRequest,
  reply: FastifyReply,
  sseSelections: SseRuntimeSelection[],
  options: FastifySSERouteOptions | undefined,
  responseHeaderSchema?: ResponseHeaderSchema,
): {
  // biome-ignore lint/suspicious/noExplicitAny: SSE event schemas are contract-specific, cast at call site
  sseContext: SSEContext<any>
  isStarted: () => boolean
  markHandlerDone: () => void
} {
  // @fastify/sse is an optional peer and Fastify silently ignores the unknown `sse` route
  // option when it is not registered — without this guard the request dies on an opaque
  // `undefined` read the first time the route is hit.
  if (!reply.sse) {
    throw new Error(
      "Contract declares an SSE response but the '@fastify/sse' plugin is not registered on this Fastify instance. Register it with `await app.register(fastifySSE)` before adding SSE-capable routes.",
    )
  }

  let started = false
  let sessionMode: SSESessionMode | undefined
  let closedByServer = false

  const closeAsServer = () => {
    closedByServer = true
    reply.sse.close()
  }

  ;(reply as WithApiSseRuntime)[kApiSseRuntime] = {
    isConnected: () => reply.sse.isConnected,
    sendErrorEvent: (payload) => reply.sse.send({ event: 'error', data: payload }),
    close: closeAsServer,
  }

  const sseContext: SSEContext = {
    start: <Context = unknown>(
      mode: SSESessionMode,
      startOptions?: SSEStartOptions<Context> & {
        statusCode?: number | string
        contentType?: string
      },
    ) => {
      const { events: eventSchemas } = resolveSseSelection(sseSelections, startOptions)
      validateApiResponseHeaders(responseHeaderSchema, reply)

      started = true
      sessionMode = mode

      // The plugin-level keep-alive is always enabled so `@fastify/sse` never tears the
      // stream down on a handler rejection before Fastify's error path runs — the route
      // errorHandler is the single place errors are handled, and it needs the stream live
      // to send a terminal `error` event. Session lifetime is managed by the route runtime
      // instead: `markHandlerDone()` closes `autoClose` sessions when the handler completes.
      reply.sse.keepAlive()

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
            const sent = await send(message.event, message.data, {
              id: message.id,
              retry: message.retry,
            })
            // A failed write means the client is gone — stop pulling from the source
            // instead of draining it into the void. Breaking calls the iterator's `return()`,
            // so an `async function*` source runs its `finally` and cleans up.
            if (!sent || !reply.sse.isConnected) {
              break
            }
          }
        },
        close: closeAsServer,
      }

      if (options?.onConnect) {
        void Promise.resolve(options.onConnect(session)).catch((err) => {
          request.log.error({ err }, 'SSE onConnect hook failed')
        })
      }

      if (options?.onClose) {
        const onClose = options.onClose
        reply.sse.onClose(() => {
          void Promise.resolve(onClose(session, closedByServer ? 'server' : 'client')).catch(
            (err) => {
              request.log.error({ err }, 'SSE onClose hook failed')
            },
          )
        })
      }

      if (options?.onReconnect && reply.sse.lastEventId) {
        const onReconnect = options.onReconnect
        const lastEventId = reply.sse.lastEventId
        void reply.sse
          .replay(async () => {
            const replay = await onReconnect(session, lastEventId)
            if (replay) {
              for await (const msg of replay) {
                await reply.sse.send(msg)
              }
            }
          })
          .catch((err) => {
            request.log.error({ err }, 'SSE onReconnect replay failed')
          })
      }

      return session
    },
  }

  return {
    sseContext,
    isStarted: () => started,
    // Called after the handler resolves: an `autoClose` session ends with the handler, and
    // that close is server-initiated (the plugin-level keep-alive is always on, so the
    // route runtime owns the close). A `keepAlive` session stays open.
    markHandlerDone: () => {
      if (sessionMode === 'autoClose') {
        closeAsServer()
      }
    },
  }
}
