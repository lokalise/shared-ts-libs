import type { SSEEventSchemas } from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { z } from 'zod/v4'

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
 * Which side initiated the SSE connection close.
 * - `'server'`: `session.close()` was called, or an `autoClose` session ended because the
 *   handler completed.
 * - `'client'`: Client closed the connection (EventSource.close(), navigation, network failure)
 */
export type SSECloseInitiator = 'server' | 'client'

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
  context?: Context
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
  /** Close the connection from the server side (`onClose` fires with initiator `'server'`). */
  close: () => void
}

// ============================================================================
// SSE context (deferred header sending)
// ============================================================================

/**
 * Context object passed to SSE handlers for deferred header sending.
 *
 * Lets handlers validate before any headers are sent and then either return an early
 * HTTP response as `{ status, body }`, or explicitly start streaming (via `start()`).
 *
 * @template Events - Event schemas for type-safe sending
 */
export type SSEContext<Events extends SSEEventSchemas = SSEEventSchemas> = {
  /**
   * Start streaming — sends HTTP 200 + SSE headers and returns a typed session.
   * After this call you can no longer send a regular HTTP response.
   */
  start: <Context = unknown>(
    mode: SSESessionMode,
    options?: SSEStartOptions<Context>,
  ) => SSESession<Events, Context>

  /** Escape hatch to the raw Fastify reply. Prefer the typed methods above. */
  reply: FastifyReply
}

// ============================================================================
// SSE route options
// ============================================================================

/**
 * Options for configuring an SSE (or dual-mode) route.
 */
export type FastifySSERouteOptions = {
  /** Called when the client connects (after the SSE handshake). */
  onConnect?: (connection: SSESession) => void | Promise<void>
  /** Called when the SSE connection closes, with the side that initiated the close. */
  onClose?: (connection: SSESession, initiator: SSECloseInitiator) => void | Promise<void>
  /**
   * Handler for `Last-Event-ID` reconnection.
   * Return an iterable of events to replay, or handle replay manually.
   */
  onReconnect?: (
    connection: SSESession,
    lastEventId: string,
  ) => Iterable<SSEMessage> | AsyncIterable<SSEMessage> | void | Promise<void>
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
}
