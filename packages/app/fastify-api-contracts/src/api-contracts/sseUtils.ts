import { randomUUID } from 'node:crypto'
import type { SseSchemaByEventName } from '@lokalise/api-contracts'
import { InternalError } from '@lokalise/node-core'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type {
  FastifySSERouteOptions,
  SSEContext,
  SSESession,
  SSESessionMode,
  SSEStartOptions,
  SSEStreamMessage,
} from './sseTypes.ts'

/** True when `candidate` satisfies an accepted media type — exact, `type/*`, or `*\/*` match. */
const matchesMediaType = (candidate: string, accepted: string): boolean => {
  if (accepted === '*/*') {
    return true
  }
  const normalized = candidate.trim().toLowerCase()
  if (accepted === normalized) {
    return true
  }
  // `type/*` wildcard: "text/*" matches "text/event-stream", "text/csv", …
  return accepted.endsWith('/*') && normalized.startsWith(accepted.slice(0, -1))
}

/**
 * Pick the response content-type the client prefers among the given candidates, based on the
 * request's `Accept` header. Supports quality values (`q=`) and wildcards (`type/*`, `*\/*`)
 * for content negotiation; candidates earlier in the list win ties (e.g. under `*\/*`).
 *
 * Returns `undefined` when the request carries no `Accept` header or none of the candidates
 * is acceptable — the caller decides the fallback.
 *
 * @param request - The Fastify request whose `Accept` header drives the negotiation
 * @param contentTypes - Candidate response content-types, in server preference order
 * @returns The preferred candidate, or `undefined` when there is no acceptable match
 */
export function determineResponseContentType<TContentType extends string>(
  request: FastifyRequest,
  contentTypes: readonly TContentType[],
): TContentType | undefined {
  const accept = request.headers.accept
  if (!accept) {
    return undefined
  }

  // Split by comma and parse each accepted media type with its quality value
  const acceptedMediaTypes = accept
    .split(',')
    .map((part) => {
      const [mediaType, ...params] = part.trim().split(';')
      let quality = 1.0

      for (const param of params) {
        const [key, value] = param.trim().split('=')
        if (key === 'q' && value) {
          quality = Number.parseFloat(value)
        }
      }

      return { mediaType: (mediaType ?? '').trim().toLowerCase(), quality }
    })
    // Filter out rejected types (quality <= 0)
    .filter((entry) => entry.quality > 0)

  // Sort by quality (highest first)
  acceptedMediaTypes.sort((a, b) => b.quality - a.quality)

  for (const { mediaType } of acceptedMediaTypes) {
    const match = contentTypes.find((candidate) => matchesMediaType(candidate, mediaType))
    if (match !== undefined) {
      return match
    }
  }

  return undefined
}

/**
 * Build the `sse` context passed to SSE-capable handlers, plus the lifecycle probes the
 * route runtime needs (`isStarted`, `markHandlerDone`).
 */
export function buildApiSSEContext(
  request: FastifyRequest,
  reply: FastifyReply,
  eventSchemas: SseSchemaByEventName,
  options: FastifySSERouteOptions | undefined,
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
