import type { Readable } from 'node:stream'
import type {
  ApiContract,
  ContractResponseMode,
  InferServerRequest,
  InferServerResponse,
  InferServerResponseContentTypes,
  InferServerSseSelections,
} from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { FastifySSERouteOptions, SSEContext } from './sseTypes.ts'
import type { ApiContractMetadataToRouteMapper } from './types.ts'

/** What a handler may return for a `blobBody()` response; Fastify sends these natively. */
type FastifyBlobBody = string | Buffer | Readable

/**
 * Discriminated union of `{ status, contentType?, body }` results for every response a
 * contract declares. See `InferServerResponse` in `@lokalise/api-contracts`; a `blobBody()`
 * response takes a `string`, `Buffer` or `Readable`.
 */
export type InferApiHandlerResult<TApiContract extends ApiContract> = InferServerResponse<
  TApiContract,
  FastifyBlobBody
>

/** Infer the typed `FastifyRequest` for an `ApiContract`. */
export type InferApiHandlerRequest<Contract extends ApiContract> = FastifyRequest<{
  Params: InferServerRequest<Contract>['pathParams']
  Querystring: InferServerRequest<Contract>['queryParams']
  Headers: InferServerRequest<Contract>['headers']
  Body: InferServerRequest<Contract>['body']
}>

/** Union of the response content-types the contract's success entries declare (error responses excluded). */
export type InferContractResponseContentTypes<TContract extends ApiContract> =
  InferServerResponseContentTypes<TContract>

/**
 * Context passed to every `ApiContract` handler as the third argument.
 *
 * `expectedContentType` is the response content-type the client prefers, negotiated from the
 * request's `Accept` header (with `q=` quality values and wildcards) against the content-types
 * the contract's success entries declare (`2xx` codes, `'2xx'`, `'default'`). Error responses
 * are not offered as candidates. Candidates keep the contract's declaration order (numeric
 * status keys ascending); under a full-wildcard `Accept`, which is what most non-browser
 * clients send, the first candidate wins. It is `null` when the client expressed no acceptable
 * preference, in which case the handler decides the fallback.
 *
 * Contracts that declare an SSE response are additionally extended with the `sse` context
 * for imperative streaming (`sse.start()` for keep-alive, lifecycle hooks, or reconnection).
 * When the contract declares several SSE representations, `sse.start()` requires a
 * `{ statusCode, contentType }` selection and the session's `send` is typed by exactly the
 * selected representation's event schemas.
 */
export type ApiHandlerContext<TContract extends ApiContract> = {
  expectedContentType: InferContractResponseContentTypes<TContract> | null
} & ([ContractResponseMode<TContract['responsesByStatusCode']>] extends ['non-sse']
  ? unknown
  : {
      sse: SSEContext<InferServerSseSelections<TContract>>
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
 * response after validation; handlers return `{ status, body }` instead. Fluent setters
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
 * The `context` (see {@link ApiHandlerContext}) always provides `expectedContentType`, the
 * `Accept`-negotiated response content-type. Contracts that declare an SSE response
 * additionally get `context.sse` for imperative streaming; after `sse.start()` the handler
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
      // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional, the handler returns nothing after sse.start()
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
     * the Fastify route options as a base: explicitly passed options override it,
     * except `config` objects, which are merged key-by-key (explicit keys win).
     * Useful for cross-cutting concerns (auth, rate limiting, tracing) driven by
     * metadata declared on the contract.
     */
    contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper
  }
