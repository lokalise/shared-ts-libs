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
  eventSchemas: SseSchemaByEventName,
  options: FastifySSERouteOptions | undefined,
  responseHeaderSchema?: ResponseHeaderSchema,
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
      validateApiResponseHeaders(responseHeaderSchema, reply)

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
        close: () => {
          closedByServer = true
          reply.sse.close()
        },
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
