import type { HttpStatusCode, SSEEventSchemas } from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { z } from 'zod/v4'
import type { ApiContractMetadataToRouteMapper } from '../types.ts'

// Re-export so consumers can reference the contract's event-schema shape.
export type { SSEEventSchemas }

// ============================================================================
// Dual-mode
// ============================================================================

/**
 * Response mode determined by the `Accept` header for a dual-mode route.
 */
export type DualModeType = 'json' | 'sse'

// ============================================================================
// SSE primitives
// ============================================================================

/**
 * Minimal logger interface for SSE route error handling.
 * Compatible with `CommonLogger` from `@lokalise/node-core` and pino loggers.
 */
export type SSELogger = {
  error: (obj: Record<string, unknown>, msg: string) => void
  warn?: (obj: Record<string, unknown>, msg: string) => void
}

/**
 * SSE message format compatible with `@fastify/sse`.
 *
 * @template T - Type of the event data (objects or primitives)
 */
export type SSEMessage<T = unknown> = {
  /** Event name (maps to the EventSource `event` field) */
  event?: string
  /** Event data — objects or primitives, serialized per `@fastify/sse` config */
  data: T
  /** Event ID for client reconnection via `Last-Event-ID` */
  id?: string
  /** Reconnection delay hint in milliseconds */
  retry?: number
}

/**
 * Type-safe event sender for SSE connections.
 *
 * Provides compile-time type checking for event names and their corresponding
 * data payloads based on the contract's event schemas.
 *
 * @template Events - Map of event name to Zod schema (from the contract's SSE response)
 */
export type SSEEventSender<Events extends SSEEventSchemas> = <
  EventName extends keyof Events & string,
>(
  eventName: EventName,
  data: z.input<Events[EventName]>,
  options?: { id?: string; retry?: number },
) => Promise<boolean>

/**
 * Reason why the SSE connection was closed.
 * - `'server'`: Server explicitly closed the connection
 * - `'client'`: Client closed the connection (EventSource.close(), navigation, network failure)
 */
export type SSECloseReason = 'server' | 'client'

// ============================================================================
// SSE handler result types
// ============================================================================

/**
 * Type for `responseBodySchemasByStatusCode` — maps HTTP status codes to Zod schemas.
 */
export type ResponseSchemasByStatusCode = Partial<Record<HttpStatusCode, z.ZodType>>

/**
 * Result indicating the handler returned an HTTP response before streaming started.
 * Created via `sse.respond(code, body)`.
 */
export type SSERespondResult = {
  _type: 'respond'
  code: number
  body: unknown
}

/**
 * Possible results from an SSE handler.
 * - `SSERespondResult`: Send an HTTP response before streaming (via `sse.respond()`)
 * - `void`: Streaming was started via `sse.start()`
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — handlers can return nothing after calling sse.start()
export type SSEHandlerResult = SSERespondResult | void

/**
 * Strictly typed `respond` function for `sse.respond()`.
 *
 * When `responseBodySchemasByStatusCode` is defined, the body must match the
 * schema for the given status code; otherwise any body is accepted.
 */
export type StrictRespondFunction<ResponseSchemas extends ResponseSchemasByStatusCode | undefined> =
  ResponseSchemas extends ResponseSchemasByStatusCode
    ? keyof ResponseSchemas & number extends never
      ? (code: number, body: unknown) => SSERespondResult
      : <Code extends keyof ResponseSchemas & number>(
          code: Code,
          body: ResponseSchemas[Code] extends z.ZodType ? z.infer<ResponseSchemas[Code]> : unknown,
        ) => SSERespondResult
    : (code: number, body: unknown) => SSERespondResult

// ============================================================================
// SSE session
// ============================================================================

/**
 * Session lifetime mode, specified when calling `sse.start()`.
 * - `'autoClose'`: Close the session automatically after the handler completes
 * - `'keepAlive'`: Keep the session open after the handler completes
 */
export type SSESessionMode = 'autoClose' | 'keepAlive'

/**
 * Options for starting an SSE connection.
 */
export type SSEStartOptions<Context = unknown> = {
  /** Initial context data for the connection */
  context?: Context
}

/**
 * Message format for use with `SSESession.sendStream()`.
 *
 * @template Events - Event schemas for type-safe event names and data
 */
export type SSEStreamMessage<Events extends SSEEventSchemas = SSEEventSchemas> = {
  [K in keyof Events & string]: {
    event: K
    data: z.input<Events[K]>
    id?: string
    retry?: number
  }
}[keyof Events & string]

/**
 * Represents an active SSE connection with typed event sending.
 *
 * @template Events - Event schemas for type-safe sending
 * @template Context - Custom context data stored per connection
 */
export type SSESession<Events extends SSEEventSchemas = SSEEventSchemas, Context = unknown> = {
  /** Unique identifier for this connection */
  id: string
  /** The original Fastify request */
  request: FastifyRequest
  /** The Fastify reply with SSE capabilities from `@fastify/sse` */
  reply: FastifyReply
  /** Custom context data for this connection */
  context: Context
  /** Timestamp when the connection was established */
  connectedAt: Date
  /** Type-safe event sender for this connection. */
  send: SSEEventSender<Events>
  /** Check if the SSE connection is still open. */
  isConnected: () => boolean
  /** Get the underlying writable stream for advanced streaming operations. */
  getStream: () => NodeJS.WritableStream
  /** Send multiple SSE messages from an async iterable, validating each against the event schemas. */
  sendStream: (messages: AsyncIterable<SSEStreamMessage<Events>>) => Promise<void>
  /**
   * Zod schemas for validating event data.
   * @internal
   */
  eventSchemas?: SSEEventSchemas
}

// ============================================================================
// SSE context (deferred header sending)
// ============================================================================

/**
 * Context object passed to SSE handlers for deferred header sending.
 *
 * Lets handlers validate before any headers are sent, return early with an HTTP
 * response (via `respond()`), or explicitly start streaming (via `start()`).
 *
 * @template Events - Event schemas for type-safe sending
 * @template ResponseSchemas - Response schemas by status code for strict `respond()` typing
 */
export type SSEContext<
  Events extends SSEEventSchemas = SSEEventSchemas,
  ResponseSchemas extends ResponseSchemasByStatusCode | undefined = undefined,
> = {
  /**
   * Start streaming — sends HTTP 200 + SSE headers and returns a typed session.
   * After this call you can no longer send a regular HTTP response.
   */
  start: <Context = unknown>(
    mode: SSESessionMode,
    options?: SSEStartOptions<Context>,
  ) => SSESession<Events, Context>

  /**
   * Send an HTTP response before streaming starts (early return).
   * Must be called BEFORE `start()`.
   */
  respond: StrictRespondFunction<ResponseSchemas>

  /**
   * Advanced: send headers without creating a full connection.
   * Most handlers should use `start()` instead.
   */
  sendHeaders: () => void

  /** Escape hatch to the raw Fastify reply. Prefer the typed methods above. */
  reply: FastifyReply
}

// ============================================================================
// Sync-mode reply
// ============================================================================

// Extracts keys of FastifyReply whose return type extends FastifyReply (fluent setters).
// If Fastify adds a new fluent method, it appears in this type automatically.
type FastifyReplyFluentKeys = {
  [K in keyof FastifyReply]: FastifyReply[K] extends (...args: never[]) => infer R
    ? [R] extends [FastifyReply]
      ? K
      : never
    : never
}[keyof FastifyReply]

// Replaces FastifyReply return types with NewReturn in a function type,
// preserving the original parameter signatures from FastifyReply.
type ReplaceReturn<F, NewReturn> = F extends (...args: infer A) => FastifyReply
  ? (...args: A) => NewReturn
  : F

/**
 * Reply object available to sync handlers.
 *
 * Unlike the full `FastifyReply`, this omits `send()` because the framework sends
 * the response after validation. Sync handlers return the `{ status, body }` pair
 * directly instead of calling `reply.send()`.
 *
 * Fluent setters (`code`, `status`, `header`, …) are overridden to return
 * `SyncModeReply` so that chaining `.send()` after them is a compile-time error.
 */
export type SyncModeReply = Omit<FastifyReply, 'send' | FastifyReplyFluentKeys> & {
  [K in Exclude<FastifyReplyFluentKeys, 'send'>]: ReplaceReturn<FastifyReply[K], SyncModeReply>
}

// ============================================================================
// SSE route options
// ============================================================================

/**
 * Async preHandler hook for SSE routes.
 *
 * IMPORTANT: SSE route preHandlers MUST return a Promise for proper integration
 * with `@fastify/sse`. Synchronous handlers will cause connection issues.
 */
export type FastifySSEPreHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<unknown>

/**
 * Options for configuring an SSE (or dual-mode) route.
 */
export type FastifySSERouteOptions = {
  /**
   * Async preHandler hook for authentication/authorization.
   * Runs BEFORE the SSE connection is established. MUST return a Promise.
   */
  preHandler?: FastifySSEPreHandler
  /** Called when the client connects (after the SSE handshake). */
  onConnect?: (connection: SSESession) => void | Promise<void>
  /** Called when the SSE connection closes for any reason. */
  onClose?: (connection: SSESession, reason: SSECloseReason) => void | Promise<void>
  /**
   * Handler for `Last-Event-ID` reconnection.
   * Return an iterable of events to replay, or handle replay manually.
   */
  onReconnect?: (
    connection: SSESession,
    lastEventId: string,
  ) => Iterable<SSEMessage> | AsyncIterable<SSEMessage> | void | Promise<void>
  /**
   * Optional logger for SSE route errors.
   * Compatible with `CommonLogger` from `@lokalise/node-core` and pino loggers.
   */
  logger?: SSELogger
  /**
   * Custom serializer for SSE message data on this route.
   * @default JSON.stringify
   */
  serializer?: (data: unknown) => string
  /**
   * Heartbeat interval in milliseconds for this route. Set to 0 to disable.
   * @default 30000
   */
  heartbeatInterval?: number
  /**
   * Maps contract metadata to additional Fastify route options.
   *
   * Called with the contract's `metadata` field; its return value is merged into
   * the Fastify route options as a base — useful for cross-cutting concerns (auth,
   * rate limiting, tracing) driven by metadata declared on the contract.
   */
  contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper
}
