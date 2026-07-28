import type { Readable } from 'node:stream'
import type {
  ApiContract,
  ContractResponseMode,
  ExpandStatusRangeKey,
  HttpStatusCode,
  HttpStatusCodeRange,
  InferSseSuccessResponses,
  PayloadApiContract,
  SSEEventSchemas,
} from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { z } from 'zod/v4'
import type { ApiContractMetadataToRouteMapper } from '../types.ts'
import type { FastifySSERouteOptions, SSEContext, SSEStreamMessage } from './sseTypes.ts'

/** True when `TUnion` has two or more members. */
type IsUnion<TUnion, TFull = TUnion> = TUnion extends unknown
  ? [TFull] extends [TUnion]
    ? false
    : true
  : never

/**
 * Maps one content-map media-type descriptor to its handler body type: an `sseBody()` streams
 * the contract events, a `blobBody()` is a raw body (`string`/`Buffer`/`Readable`, sent
 * natively by Fastify), and a Zod schema is its JSON input — the handler's body is what the
 * response serializer parses, so defaults/transforms are applied after the handler returns.
 */
type BodyDescriptorBody<TDescriptor> = TDescriptor extends {
  _tag: 'SseBody'
  schemaByEventName: infer TSchemas extends SSEEventSchemas
}
  ? AsyncIterable<SSEStreamMessage<TSchemas>>
  : TDescriptor extends { _tag: 'BlobBody' }
    ? string | Buffer | Readable
    : TDescriptor extends z.ZodType
      ? z.input<TDescriptor>
      : never

/**
 * Maps a content-map `content` object to the union of its handler result variants, one per
 * media type. When the status declares a single media type, `contentType` is optional; when
 * it declares several, `contentType` is required and discriminates which representation
 * (and hence which `body` type) the handler chose.
 */
type ContentMapResults<TStatusCode, TContent> = {
  [TMediaType in keyof TContent]: IsUnion<keyof TContent> extends true
    ? {
        status: TStatusCode
        contentType: TMediaType
        body: BodyDescriptorBody<TContent[TMediaType]>
      }
    : {
        status: TStatusCode
        contentType?: TMediaType
        body: BodyDescriptorBody<TContent[TMediaType]>
      }
}[keyof TContent]

/**
 * Maps a single `responsesByStatusCode` entry to its handler result variants: a bare Zod
 * schema is `{ status, body }` with its JSON input; a content-map entry contributes one
 * variant per media type (see {@link ContentMapResults}); an empty-body entry
 * (`noBodyResponse()` / `allowNoBody: true`) contributes `{ status, body: null }`.
 */
type ResponseEntryResults<TStatusCode, TEntry> = TEntry extends z.ZodType
  ? { status: TStatusCode; body: z.input<TEntry> }
  :
      | (TEntry extends { content: infer TContent }
          ? ContentMapResults<TStatusCode, TContent>
          : never)
      | (TEntry extends { allowNoBody: true } ? { status: TStatusCode; body: null } : never)

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
type HandlerStatusesForKey<TApiContract extends ApiContract, TKey> = TKey extends 'default'
  ? Exclude<HttpStatusCode, ExactStatusCodes<TApiContract> | RangeStatusCodes<TApiContract>>
  : TKey extends HttpStatusCodeRange
    ? Exclude<ExpandStatusRangeKey<TKey>, ExactStatusCodes<TApiContract>>
    : TKey

/**
 * Discriminated union of `{ status, contentType?, body }` results for every response a
 * contract declares. `contentType` exists only for content-map responses — required (and a
 * discriminant) when a status declares several media types, optional when it declares one.
 * Wildcard status keys (`'4xx'`, `'2xx'`, `'default'`) accept any concrete status they cover.
 */
export type InferApiHandlerResult<TApiContract extends ApiContract> = {
  [TStatusCode in keyof TApiContract['responsesByStatusCode']]: ResponseEntryResults<
    HandlerStatusesForKey<TApiContract, TStatusCode>,
    TApiContract['responsesByStatusCode'][TStatusCode]
  >
}[keyof TApiContract['responsesByStatusCode']]

type InferOptSchema<T> = T extends z.ZodType ? z.output<T> : undefined

type InferApiBodyType<Contract extends ApiContract> = Contract extends PayloadApiContract
  ? InferOptSchema<Contract['requestBodySchema']>
  : undefined

/** Infer the typed `FastifyRequest` for an `ApiContract`. */
export type InferApiHandlerRequest<Contract extends ApiContract> = FastifyRequest<{
  Params: InferOptSchema<Contract['requestPathParamsSchema']>
  Querystring: InferOptSchema<Contract['requestQuerySchema']>
  Headers: InferOptSchema<Contract['requestHeaderSchema']>
  Body: InferApiBodyType<Contract>
}>

/**
 * Maps a single `responsesByStatusCode` entry to the response content-types it declares:
 * a content-map entry contributes its media-type keys; a bare Zod schema is `application/json`.
 */
type ResponseEntryContentTypes<TEntry> = TEntry extends z.ZodType
  ? 'application/json'
  : TEntry extends { content: infer TContent }
    ? keyof TContent & string
    : never

/** Union of all response content-types a contract declares across its status codes. */
export type InferContractResponseContentTypes<TContract extends ApiContract> = {
  [TStatusCode in keyof TContract['responsesByStatusCode']]: ResponseEntryContentTypes<
    TContract['responsesByStatusCode'][TStatusCode]
  >
}[keyof TContract['responsesByStatusCode']]

/**
 * Context passed to every `ApiContract` handler as the third argument.
 *
 * `expectedContentType` is the response content-type the client prefers, negotiated from the
 * request's `Accept` header (with `q=` quality values and wildcards) against the response
 * content-types the contract declares across all of its status codes, error responses
 * included — so it reflects the client's preference, not necessarily a representation the
 * success status can produce. It is `null` when the client expressed no acceptable
 * preference, in which case the handler decides the fallback.
 *
 * Contracts that declare an SSE response are additionally extended with the `sse` context
 * for imperative streaming (`sse.start()` for keep-alive, lifecycle hooks, or reconnection).
 */
export type ApiHandlerContext<TContract extends ApiContract> = {
  expectedContentType: InferContractResponseContentTypes<TContract> | null
} & ([ContractResponseMode<TContract['responsesByStatusCode']>] extends ['non-sse']
  ? unknown
  : {
      sse: SSEContext<
        Extract<InferSseSuccessResponses<TContract['responsesByStatusCode']>, SSEEventSchemas>
      >
    })

type MaybePromise<T> = T | Promise<T>

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
 * The reply object available to `ApiContract` handlers.
 *
 * Unlike the full `FastifyReply`, this omits `send()` because the framework sends the
 * response after validation — handlers return `{ status, body }` instead. Fluent setters
 * (`code`, `status`, `header`, …) are overridden to return `ApiHandlerReply` so that
 * chaining `.send()` after them is a compile-time error too.
 */
export type ApiHandlerReply = Omit<FastifyReply, 'send' | FastifyReplyFluentKeys> & {
  [K in Exclude<FastifyReplyFluentKeys, 'send'>]: ReplaceReturn<FastifyReply[K], ApiHandlerReply>
}

/**
 * Handler for an `ApiContract`: `(request, reply, context) => { status, body }` for any
 * response the contract declares. The `body` type follows the contract entry for that status:
 * the JSON/blob payload, or an `AsyncIterable` of events (e.g. an `async function*`) for an
 * SSE status. When a status declares several media types, the result also requires a
 * `contentType` naming the chosen representation (`{ status, contentType, body }`).
 *
 * The `context` (see {@link ApiHandlerContext}) always provides `expectedContentType` — the
 * `Accept`-negotiated response content-type; contracts that declare an SSE response
 * additionally get `context.sse` for imperative streaming — after `sse.start()` the handler
 * returns nothing.
 *
 * @example
 * ```typescript
 * async (request, reply, { expectedContentType, sse }) => {
 *   const user = await findUser(request.params.id)
 *   if (!user) return { status: 404, body: { message: 'Not found' } }
 *   if (expectedContentType === 'text/event-stream') {
 *     const session = sse.start('autoClose')
 *     await session.send('update', user)
 *     return
 *   }
 *   return { status: 200, contentType: 'application/json', body: user }
 * }
 * ```
 */
export type InferApiHandler<Contract extends ApiContract> = [
  ContractResponseMode<Contract['responsesByStatusCode']>,
] extends ['non-sse']
  ? (
      request: InferApiHandlerRequest<Contract>,
      reply: ApiHandlerReply,
      context: ApiHandlerContext<Contract>,
    ) => MaybePromise<InferApiHandlerResult<Contract>>
  : (
      request: InferApiHandlerRequest<Contract>,
      reply: ApiHandlerReply,
      context: ApiHandlerContext<Contract>,
      // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — handler returns nothing after sse.start()
    ) => MaybePromise<InferApiHandlerResult<Contract> | void>

/**
 * Extra options for an `ApiContract` route: any Fastify `RouteOptions` field except the ones
 * the contract provides (`method`, `url`, `schema`, `handler`, `sse`), plus the SSE lifecycle
 * options (`onConnect`/`onClose`/`onReconnect`, …) that apply only to SSE-capable contracts.
 */
export type ApiRouteOptions = Omit<RouteOptions, 'method' | 'url' | 'schema' | 'handler' | 'sse'> &
  FastifySSERouteOptions & {
    /**
     * Maps contract metadata to additional Fastify route options.
     *
     * Called with the contract's `metadata` field; its return value is merged into
     * the Fastify route options as a base — explicitly passed options override it,
     * except `config` objects, which are merged key-by-key (explicit keys win) —
     * useful for cross-cutting concerns (auth, rate limiting, tracing) driven by
     * metadata declared on the contract.
     */
    contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper
  }
