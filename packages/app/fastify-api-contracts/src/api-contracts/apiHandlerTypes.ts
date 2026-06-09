import type {
  ApiContract,
  ContractNoBody,
  ContractResponseMode,
  InferSseSuccessResponses,
  PayloadApiContract,
} from '@lokalise/api-contracts'
import type { FastifyRequest, RouteOptions } from 'fastify'
import type { z } from 'zod/v4'
import type {
  FastifySSERouteOptions,
  SSEContext,
  SSEEventSchemas,
  SSEStreamMessage,
  SyncModeReply,
} from './sseTypes.ts'

type MaybePromise<T> = T | Promise<T>

// ============================================================================
// Status+Body Response
// ============================================================================

/**
 * Maps a single `responsesByStatusCode` entry to its handler body type:
 * - `SseResponse`  → `AsyncIterable` of the entry's events (return it to stream)
 * - `BlobResponse` → `Blob`
 * - `TextResponse` → `string`
 * - `AnyOfResponses` → the union of its members' body types
 * - plain Zod schema → its output type
 */
type ResponseBodyEntry<T> = T extends undefined
  ? never
  : T extends { _tag: 'SseResponse'; schemaByEventName: infer S extends SSEEventSchemas }
    ? AsyncIterable<SSEStreamMessage<S>>
    : T extends { _tag: 'NoContentResponse' }
      ? undefined
      : T extends { _tag: 'BlobResponse' }
        ? Blob
        : T extends { _tag: 'TextResponse' }
          ? string
          : T extends z.ZodType
            ? z.output<T>
            : T extends { _tag: 'AnyOfResponses'; responses: Array<infer R> }
              ? ResponseBodyEntry<R>
              : undefined

/**
 * Discriminated union of `{ status, body }` pairs for every response a contract declares.
 *
 * The handler returns one of these to send a status code and body together (no separate
 * `reply.code()` call). For an SSE response the `body` is an `AsyncIterable` of events —
 * returning it streams those events to the client.
 *
 * @example
 * ```typescript
 * async (request) => {
 *   if (!valid) return { status: 400, body: { error: 'Bad Request' } }
 *   return { status: 200, body: { id: request.params.id } }
 * }
 * ```
 */
export type InferApiStatusResponse<TApiContract extends ApiContract> = {
  [K in keyof TApiContract['responsesByStatusCode']]: ResponseBodyEntry<
    TApiContract['responsesByStatusCode'][K]
  > extends never
    ? never
    : { status: K; body: ResponseBodyEntry<TApiContract['responsesByStatusCode'][K]> }
}[keyof TApiContract['responsesByStatusCode']]

// ============================================================================
// Request Inference
// ============================================================================

type InferOptSchema<T, Fallback = unknown> =
  NonNullable<T> extends z.ZodType ? z.output<NonNullable<T>> : Fallback

type InferApiBodyType<Contract extends ApiContract> = Contract extends PayloadApiContract
  ? Contract['requestBodySchema'] extends typeof ContractNoBody
    ? undefined
    : NonNullable<Contract['requestBodySchema']> extends z.ZodType
      ? z.output<NonNullable<Contract['requestBodySchema']>>
      : undefined
  : undefined

/**
 * Infer the `FastifyRequest` type from an `ApiContract`.
 *
 * Provides properly typed params, querystring, headers, and body.
 *
 * @example
 * ```typescript
 * const handler = async (request: InferApiRequest<typeof myContract>) => {
 *   request.params.userId  // typed
 *   request.body.name      // typed
 * }
 * ```
 */
export type InferApiRequest<Contract extends ApiContract> = FastifyRequest<{
  Params: InferOptSchema<Contract['requestPathParamsSchema']>
  Querystring: InferOptSchema<Contract['requestQuerySchema']>
  Headers: InferOptSchema<Contract['requestHeaderSchema']>
  Body: InferApiBodyType<Contract>
}>

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Handler inferred from a contract's response mode.
 *
 * - **Non-SSE contracts** (`(request, reply)`): always `return { status, body }` — the
 *   framework validates the body against the contract's schema for that status code and
 *   sends it. Use `reply.header()` to set response headers when needed.
 *
 * - **SSE-capable contracts** (`(request, reply, sse)`): a single handler covers both
 *   representations. Shared logic (auth, loading, validation) runs once, then the handler
 *   `return`s a `{ status, body }` response. For an SSE status the `body` is an
 *   `AsyncIterable` of events (e.g. from an `async function*`) — returning it opens the
 *   connection, validates and sends each event, then closes it; for any other status the
 *   `body` is the usual JSON/text/blob payload. For advanced control (keep-alive, lifecycle
 *   hooks, reconnection) call `sse.start(mode)` and drive the session imperatively instead.
 *   The `sse` context is only present on the signature when the contract
 *   declares an SSE response, so non-SSE routes never see it.
 *
 * @example Non-SSE
 * ```typescript
 * async (request) => ({ status: 200, body: { id: request.params.userId } })
 * ```
 *
 * @example SSE-capable — return `{ status, body }` whose body is an async iterable
 * ```typescript
 * async (request, reply, sse) => {
 *   const user = await findUser(request.params.id)
 *   if (!user) return { status: 404, body: { message: 'Not found' } } // shared by both
 *
 *   if (request.headers.accept !== 'text/event-stream') {
 *     return { status: 200, body: user }
 *   }
 *   return {
 *     status: 200,
 *     body: (async function* () {
 *       yield { event: 'update', data: user }
 *       yield { event: 'done', data: { total: 1 } }
 *     })(),
 *   }
 * }
 * ```
 */
export type InferApiHandler<Contract extends ApiContract> = [
  ContractResponseMode<Contract['responsesByStatusCode']>,
] extends ['non-sse']
  ? (
      request: InferApiRequest<Contract>,
      reply: SyncModeReply,
    ) => MaybePromise<InferApiStatusResponse<Contract>>
  : (
      request: InferApiRequest<Contract>,
      reply: SyncModeReply,
      sse: SSEContext<InferSseSuccessResponses<Contract['responsesByStatusCode']>>,
      // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — handler returns nothing after sse.start()
    ) => MaybePromise<InferApiStatusResponse<Contract> | void>

// ============================================================================
// Route Options
// ============================================================================

/**
 * Options for configuring an `ApiContract` route.
 *
 * Extends Fastify's `RouteOptions` minus the fields the contract provides
 * (`method`, `url`, `schema`, `handler`, `sse`), so any Fastify hook or config
 * (`preHandler`, `onRequest`, `config`, `bodyLimit`, etc.) can be passed directly.
 *
 * SSE lifecycle options (`onConnect`, `onClose`, `onReconnect`) are only relevant
 * for SSE and dual-mode contracts and are ignored for non-SSE routes.
 */
export type ApiRouteOptions = Omit<RouteOptions, 'method' | 'url' | 'schema' | 'handler' | 'sse'> &
  Omit<FastifySSERouteOptions, 'preHandler'>
