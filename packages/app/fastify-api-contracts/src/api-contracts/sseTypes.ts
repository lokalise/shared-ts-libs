import type { SSEEventSchemas } from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { z } from 'zod/v4'

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
  /**
   * Send multiple SSE messages from an async iterable, validating each against the event
   * schemas. Stops pulling from the iterable as soon as a write fails or the client
   * disconnects — an `async function*` source gets to run its `finally` and clean up.
   */
  sendStream: (messages: AsyncIterable<SSEStreamMessage<Events>>) => Promise<void>
  /** Close the connection from the server side (`onClose` fires with initiator `'server'`). */
  close: () => void
}

// ============================================================================
// SSE context (deferred header sending)
// ============================================================================

/**
 * One SSE representation a contract declares: the response status key it lives under
 * (`200`, `'2xx'`, …), its media type, and its event schemas.
 */
export type SSESelection = {
  statusCode: number | string
  contentType: string
  events: SSEEventSchemas
}

/** True when `TUnion` has two or more members. */
type IsUnion<TUnion, TFull = TUnion> = TUnion extends unknown
  ? [TFull] extends [TUnion]
    ? false
    : true
  : never

/**
 * The members of `TSelections` whose status codes cover `StatusCode`. A selection under a
 * wildcard contract key carries the expanded concrete status union, so a specific status
 * (`202`) matches the `'2xx'` selection by inclusion, not by exact key equality.
 */
type MatchingSseSelections<
  TSelections extends SSESelection,
  StatusCode,
> = TSelections extends unknown
  ? Extract<StatusCode, TSelections['statusCode']> extends never
    ? never
    : TSelections
  : never

/**
 * Context object passed to SSE handlers for deferred header sending.
 *
 * Lets handlers validate before any headers are sent and then either return an early
 * HTTP response as `{ status, body }`, or explicitly start streaming (via `start()`).
 *
 * `start()` sends HTTP 200 + SSE headers and returns a typed session; after the call a
 * regular HTTP response can no longer be sent. When the contract declares a single SSE
 * representation, that one's event schemas apply. When it declares several, `start()`
 * requires a `{ statusCode, contentType }` selection naming which representation the
 * session streams — the session's `send`/`sendStream` are typed by (and validate against)
 * exactly that representation's event schemas.
 *
 * @template TSelections - The SSE representations the contract declares
 */
export type SSEContext<TSelections extends SSESelection = SSESelection> =
  IsUnion<TSelections> extends true
    ? {
        start: <
          Context = unknown,
          StatusCode extends TSelections['statusCode'] = TSelections['statusCode'],
          ContentType extends MatchingSseSelections<
            TSelections,
            StatusCode
          >['contentType'] = MatchingSseSelections<TSelections, StatusCode>['contentType'],
        >(
          mode: SSESessionMode,
          options: SSEStartOptions<Context> & { statusCode: StatusCode; contentType: ContentType },
        ) => SSESession<
          Extract<
            MatchingSseSelections<TSelections, StatusCode>,
            { contentType: ContentType }
          >['events'],
          Context
        >
      }
    : {
        start: <Context = unknown>(
          mode: SSESessionMode,
          options?: SSEStartOptions<Context> & {
            statusCode?: TSelections['statusCode']
            contentType?: TSelections['contentType']
          },
        ) => SSESession<TSelections['events'], Context>
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
   * Set to `false` to disable the SSE keep-alive heartbeat for this route.
   * The heartbeat interval itself is configured at `@fastify/sse` plugin registration
   * (`heartbeatInterval`, default 30000 ms).
   */
  heartbeat?: boolean
}
