import type { z } from 'zod/v4'
import type { SseSchemaByEventName } from './contractResponse.ts'
import type { ApiContract, PayloadApiContract } from './defineApiContract.ts'
import type {
  ExpandStatusRangeKey,
  HttpStatusCode,
  HttpStatusCodeRange,
  SuccessfulHttpStatusCode,
} from './HttpStatusCodes.ts'
import type { IsUnion } from './typeUtils.ts'

/*
 * Framework-agnostic types for the serving side of a contract. They mirror `clientTypes.ts`
 * with the schema direction reversed: a server receives the validated request (`z.output`)
 * and returns a response the serializer will still parse (`z.input`).
 *
 * Server adapters (Fastify, Hono, ...) wrap these in their own request/reply types.
 */

// ============================================================================
// SSE messages
// ============================================================================

/**
 * One server-sent event as written to the stream.
 *
 * @template T - Type of the event data (objects or primitives)
 */
export type SseMessage<T = unknown> = {
  /** Event name (maps to the EventSource `event` field) */
  event?: string
  /** Event data, serialized by the adapter */
  data: T
  /** Event ID for client reconnection via `Last-Event-ID` */
  id?: string
  /** Reconnection delay hint in milliseconds */
  retry?: number
}

/**
 * Discriminated union of the events a contract's SSE schema map allows, keyed by event name.
 * The `data` is the schema input: defaults and transforms are applied on serialization.
 *
 * @template Events - Map of event name to Zod schema (from an `sseBody()` descriptor)
 */
export type SseStreamMessage<Events extends SseSchemaByEventName = SseSchemaByEventName> = {
  [K in keyof Events & string]: {
    event: K
    data: z.input<Events[K]>
    id?: string
    retry?: number
  }
}[keyof Events & string]

// ============================================================================
// Request
// ============================================================================

type InferOptionalSchemaOutput<T> = T extends z.ZodType ? z.output<T> : undefined

/**
 * The validated request a server handler receives for a contract: the `z.output` of each
 * request schema, or `undefined` where the contract declares none. `body` is `undefined` for
 * GET/DELETE contracts and for a `ContractNoBody` payload contract.
 */
export type InferServerRequest<TApiContract extends ApiContract> = {
  pathParams: InferOptionalSchemaOutput<TApiContract['requestPathParamsSchema']>
  queryParams: InferOptionalSchemaOutput<TApiContract['requestQuerySchema']>
  headers: InferOptionalSchemaOutput<TApiContract['requestHeaderSchema']>
  body: TApiContract extends PayloadApiContract
    ? InferOptionalSchemaOutput<TApiContract['requestBodySchema']>
    : undefined
}

// ============================================================================
// Status keys
// ============================================================================

/** The concrete status codes a contract declares exactly (non-wildcard keys). */
type ExactStatusCodes<TApiContract extends ApiContract> =
  keyof TApiContract['responsesByStatusCode'] & HttpStatusCode

/** Status codes covered by any range key (e.g. `'2xx'`, `'4xx'`) the contract declares. */
type RangeStatusCodes<TApiContract extends ApiContract> = {
  [K in keyof TApiContract['responsesByStatusCode'] & HttpStatusCodeRange]: ExpandStatusRangeKey<K>
}[keyof TApiContract['responsesByStatusCode'] & HttpStatusCodeRange]

/**
 * Maps a `responsesByStatusCode` key to the statuses a handler may return for it, mirroring
 * the runtime lookup precedence (exact → range → `'default'`): a concrete key stays as-is; a
 * range key expands to its status class minus the exactly-declared codes; `'default'` expands
 * to every status not covered by an exact or range key.
 */
export type InferServerStatusesForKey<
  TApiContract extends ApiContract,
  TKey,
> = TKey extends 'default'
  ? Exclude<HttpStatusCode, ExactStatusCodes<TApiContract> | RangeStatusCodes<TApiContract>>
  : TKey extends HttpStatusCodeRange
    ? Exclude<ExpandStatusRangeKey<TKey>, ExactStatusCodes<TApiContract>>
    : TKey

// ============================================================================
// Response
// ============================================================================

/**
 * Maps one content-map media-type descriptor to its handler body type: an `sseBody()` streams
 * the contract events, a `blobBody()` is the adapter's raw body type (`TBlobBody`), and a Zod
 * schema is its input, since the serializer parses the body after the handler returns.
 */
type BodyDescriptorBody<TDescriptor, TBlobBody> = TDescriptor extends {
  _tag: 'SseBody'
  schemaByEventName: infer TSchemas extends SseSchemaByEventName
}
  ? AsyncIterable<SseStreamMessage<TSchemas>>
  : TDescriptor extends { _tag: 'BlobBody' }
    ? TBlobBody
    : TDescriptor extends z.ZodType
      ? z.input<TDescriptor>
      : never

/**
 * Maps a content-map `content` object to the union of its handler result variants, one per
 * media type. When the status declares a single media type, `contentType` is optional; when
 * it declares several, `contentType` is required and discriminates which representation
 * (and hence which `body` type) the handler chose.
 */
type ContentMapResults<TStatusCode, TContent, TBlobBody> = {
  [TMediaType in keyof TContent]: IsUnion<keyof TContent> extends true
    ? {
        status: TStatusCode
        contentType: TMediaType
        body: BodyDescriptorBody<TContent[TMediaType], TBlobBody>
      }
    : {
        status: TStatusCode
        contentType?: TMediaType
        body: BodyDescriptorBody<TContent[TMediaType], TBlobBody>
      }
}[keyof TContent]

/**
 * Maps a single `responsesByStatusCode` entry to its handler result variants: a bare Zod
 * schema is `{ status, body }` with its JSON input; a content-map entry contributes one
 * variant per media type (see {@link ContentMapResults}); an empty-body entry
 * (`noBodyResponse()` / `allowNoBody: true`) contributes `{ status, body: null }`.
 */
type ResponseEntryResults<TStatusCode, TEntry, TBlobBody> = TEntry extends z.ZodType
  ? { status: TStatusCode; body: z.input<TEntry> }
  :
      | (TEntry extends { content: infer TContent }
          ? ContentMapResults<TStatusCode, TContent, TBlobBody>
          : never)
      | (TEntry extends { allowNoBody: true } ? { status: TStatusCode; body: null } : never)

/**
 * Discriminated union of `{ status, contentType?, body }` results for every response a
 * contract declares. `contentType` exists only for content-map responses: required (and a
 * discriminant) when a status declares several media types, optional when it declares one.
 * Wildcard status keys (`'4xx'`, `'2xx'`, `'default'`) accept any concrete status they cover.
 *
 * @template TBlobBody - What a handler returns for a `blobBody()` response. Runtime specific
 * (a Node adapter may accept `string | Buffer | Readable`, an edge runtime a `ReadableStream`),
 * so adapters must narrow it; the `unknown` default accepts anything.
 */
export type InferServerResponse<TApiContract extends ApiContract, TBlobBody = unknown> = {
  [TStatusCode in keyof TApiContract['responsesByStatusCode']]: ResponseEntryResults<
    InferServerStatusesForKey<TApiContract, TStatusCode>,
    TApiContract['responsesByStatusCode'][TStatusCode],
    TBlobBody
  >
}[keyof TApiContract['responsesByStatusCode']]

/**
 * Maps a single `responsesByStatusCode` entry to the response content-types it declares:
 * a content-map entry contributes its media-type keys; a bare Zod schema is `application/json`.
 */
type ResponseEntryContentTypes<TEntry> = TEntry extends z.ZodType
  ? 'application/json'
  : TEntry extends { content: infer TContent }
    ? keyof TContent & string
    : never

/** The contract's `responsesByStatusCode` keys describing success responses: `2xx` codes, `'2xx'`, `'default'`. */
type SuccessStatusKeys<TApiContract extends ApiContract> =
  keyof TApiContract['responsesByStatusCode'] & (SuccessfulHttpStatusCode | '2xx' | 'default')

/**
 * Union of the response content-types the contract's success entries declare. Error
 * responses are excluded, so this is the set a server may offer in `Accept` negotiation.
 */
export type InferServerResponseContentTypes<TApiContract extends ApiContract> = {
  [TStatusCode in SuccessStatusKeys<TApiContract>]: ResponseEntryContentTypes<
    TApiContract['responsesByStatusCode'][TStatusCode]
  >
}[SuccessStatusKeys<TApiContract>]

// ============================================================================
// SSE selections
// ============================================================================

/**
 * One SSE representation a contract declares: the response status it lives under, its media
 * type, and its event schemas.
 */
export type ServerSseSelection = {
  statusCode: number | string
  contentType: string
  events: SseSchemaByEventName
}

/**
 * Every SSE representation a contract declares, as `{ statusCode, contentType, events }`
 * selections, one member per `sseBody()` descriptor across all statuses and media types.
 * A wildcard status key (`'2xx'`, `'default'`) expands to the concrete statuses it covers
 * (minus the exactly-declared ones), so a server selects a representation with a specific
 * status like `202`, never the wildcard key itself.
 */
export type InferServerSseSelections<TApiContract extends ApiContract> = {
  [S in keyof TApiContract['responsesByStatusCode']]: TApiContract['responsesByStatusCode'][S] extends {
    content: infer TContent
  }
    ? {
        [M in keyof TContent]: TContent[M] extends {
          _tag: 'SseBody'
          schemaByEventName: infer TEvents extends SseSchemaByEventName
        }
          ? {
              statusCode: InferServerStatusesForKey<TApiContract, S>
              contentType: M & string
              events: TEvents
            }
          : never
      }[keyof TContent]
    : never
}[keyof TApiContract['responsesByStatusCode']]
