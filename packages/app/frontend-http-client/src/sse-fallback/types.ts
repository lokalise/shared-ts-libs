/**
 * The `@opinionated-machine/sse-fallback` transport seam, vendored as types.
 *
 * The fallback client core (`createResilientSubscription`) owns no HTTP: it
 * asks a `FallbackTransport` for a JSON snapshot and for an SSE stream, and
 * runs the version gate, the deadman poll and the degradation state machine on
 * top. This package supplies that transport.
 *
 * These declarations are *structural copies* of the core's own, which is
 * deliberate: TypeScript matches them by shape, so the transport built here
 * plugs into any `@opinionated-machine/sse-fallback` version without this
 * package taking a dependency on it — no version lock-step, and nothing to
 * install for consumers who only use the plain HTTP client. Keep them in sync
 * with the core if it grows a field; a mismatch shows up as an assignability
 * error at the `createResilientSubscription({ transport })` call site rather
 * than as a runtime surprise.
 */

import type { ApiContract } from '@lokalise/api-contracts'
import type { z } from 'zod/v4'

/** Which of the two channels a request, error or diagnostic belongs to. */
export type FallbackChannel = 'poll' | 'stream'

/**
 * A channel-agnostic request description, built by the binding from the
 * contract plus the subscription params. `path` is already resolved (path
 * params substituted) and carries no query string.
 */
export type FallbackTransportRequest = {
  path: string
  method: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: unknown
}

/** What `fetchSnapshot` resolves with. Non-2xx statuses resolve, they do not reject. */
export type FallbackSnapshotResponse = {
  status: number
  headers: Record<string, string>
  body: unknown
}

/**
 * The recommended stream shape: the transport hands over decoded text and the
 * core does the SSE framing itself, so heartbeat comments count as byte-level
 * liveness and every frame keeps its own `id:`.
 */
export type FallbackRawStreamResponse = {
  status: number
  headers: Record<string, string>
  chunks: AsyncIterable<string>
}

/** One SSE frame, already framed by the transport. */
export type FallbackParsedSseFrame = {
  /** The `id:` field, when the frame carried one. */
  id?: string
  /** The `event:` field; the core treats a missing name as `'message'`. */
  event?: string
  /** The raw `data:` payload, before the core's `parseEventData`. */
  data: string
  /** The `retry:` reconnection hint in ms, when one was seen. */
  retry?: number
  /** The Last-Event-ID cursor as of this frame — sticky, unlike {@link id}. */
  lastEventId?: string
}

/**
 * The parsed-event stream shape. Costs byte-level liveness (comment frames are
 * consumed by the framing) and buys pre-delivery schema validation — see
 * `eventValidation: 'drop'`.
 */
export type FallbackParsedStreamResponse = {
  status: number
  headers: Record<string, string>
  events: AsyncIterable<FallbackParsedSseFrame>
}

export type FallbackStreamResponse = FallbackRawStreamResponse | FallbackParsedStreamResponse

/** The seam the fallback client core consumes. */
export type FallbackTransport = {
  /**
   * Fetch a snapshot over the JSON branch. Resolves with status/headers/body
   * even for a non-2xx response; rejects only when there is no usable
   * snapshot (network failure, schema violation, wrong representation).
   */
  fetchSnapshot(
    request: FallbackTransportRequest,
    opts: { signal: AbortSignal },
  ): Promise<FallbackSnapshotResponse>
  /**
   * Open the SSE branch. Resolves once response headers are received; rejects
   * only on network-level failure. A non-200 status (or a
   * non-`text/event-stream` content type) is a connect failure the core counts
   * toward degradation.
   */
  openStream(
    request: FallbackTransportRequest,
    opts: { signal: AbortSignal; lastEventId?: string },
  ): Promise<FallbackStreamResponse>
}

/**
 * Subscription params, as accepted by the core's binding request builders.
 * Structural copy of the core's `FallbackRequestParams`.
 */
export type FallbackRequestParams = {
  pathParams?: Record<string, string | number>
  queryParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  body?: unknown
}

// ============================================================================
// Contract-derived types
// ============================================================================

type SuccessStatusKey = 200 | 201 | 202 | 203 | 206 | 207 | 208 | 226 | '2xx' | 'default'

type SuccessEntriesOf<TContract extends ApiContract> = NonNullable<
  TContract['responsesByStatusCode'][Extract<
    keyof TContract['responsesByStatusCode'],
    SuccessStatusKey
  >]
>

/**
 * The body descriptors a response entry declares.
 *
 * A content-map entry contributes one descriptor per media type. A bare Zod
 * schema — the JSON-only shape a poll-only contract uses, and the one this
 * package's README recommends for adopting the fallback before an SSE endpoint
 * exists — *is* the descriptor, so it has to be picked up too; reading only
 * `content` would resolve those contracts to `never`.
 */
type ContentDescriptorsOf<TEntry> = TEntry extends { content: infer TContent }
  ? TContent[keyof TContent]
  : TEntry extends z.ZodType
    ? TEntry
    : never

/**
 * The snapshot type a dual-mode contract's JSON branch resolves to — the
 * `Snapshot` type parameter of a fallback binding.
 *
 * The core infers this structurally too; declare it explicitly when a contract
 * shape defeats that inference, so a mistyped `version.ofSnapshot` is a
 * compile error instead of a runtime `undefined`.
 */
export type FallbackSnapshotOf<TContract extends ApiContract> =
  Extract<ContentDescriptorsOf<SuccessEntriesOf<TContract>>, z.ZodType> extends infer TSchema
    ? TSchema extends z.ZodType
      ? z.output<TSchema>
      : never
    : never

type SseSchemasOf<TContract extends ApiContract> =
  ContentDescriptorsOf<SuccessEntriesOf<TContract>> extends infer TDescriptor
    ? TDescriptor extends { _tag: 'SseBody'; schemaByEventName: infer TSchemas }
      ? TSchemas
      : never
    : never

/**
 * The `event name → payload` map a contract's SSE branch delivers — the
 * `Events` type parameter of a fallback binding.
 */
export type FallbackEventsOf<TContract extends ApiContract> = {
  [K in keyof SseSchemasOf<TContract>]: SseSchemasOf<TContract>[K] extends z.ZodType
    ? z.output<SseSchemasOf<TContract>[K]>
    : never
}
