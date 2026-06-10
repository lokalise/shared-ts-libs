import type { Readable } from 'node:stream'
import type {
  ApiContract,
  ContractResponseMode,
  InferSseSuccessResponses,
  PayloadApiContract,
  SSEEventSchemas,
} from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { z } from 'zod/v4'
import type { ApiContractMetadataToRouteMapper } from '../types.ts'
import type { FastifySSERouteOptions, SSEContext, SSEStreamMessage } from './sseTypes.ts'

/**
 * Maps a single `responsesByStatusCode` entry to its handler body type.
 */
type HandlerResponseBody<T> = T extends z.ZodType
  ? z.output<T>
  : T extends { _tag: 'SseResponse'; schemaByEventName: infer S extends SSEEventSchemas }
    ? AsyncIterable<SSEStreamMessage<S>>
    : T extends { _tag: 'NoBodyResponse' }
      ? undefined | null
      : T extends { _tag: 'TextResponse' }
        ? string | Buffer | Readable
        : T extends { _tag: 'BlobResponse' }
          ? Buffer | Readable
          : T extends { _tag: 'AnyOfResponses'; responses: Array<infer R> }
            ? HandlerResponseBody<R>
            : undefined

/**
 * Discriminated union of `{ status, body }` pairs for every response a contract declares.
 */
export type InferApiHandlerResult<TApiContract extends ApiContract> = {
  [TStatusCode in keyof TApiContract['responsesByStatusCode']]: HandlerResponseBody<
    TApiContract['responsesByStatusCode'][TStatusCode]
  > extends infer TBody
    ? [TBody] extends [undefined]
      ? { status: TStatusCode; body?: TBody }
      : { status: TStatusCode; body: TBody }
    : never
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
 * Handler for an `ApiContract`. Returns `{ status, body }` for any response the contract
 * declares. The `body` type follows the contract entry for that status: the JSON/text/blob payload, or an
 * `AsyncIterable` of events (e.g. an `async function*`) for an SSE status.
 *
 * Contracts that declare an SSE response also get an `sse` context as the third arg
 * (`(request, reply, sse)`) for imperative streaming — `sse.start()` for keep-alive, lifecycle
 * hooks, or reconnection; non-SSE contracts get just `(request, reply)`.
 *
 * @example
 * ```typescript
 * async (request, reply, sse) => {
 *   const user = await findUser(request.params.id)
 *   if (!user) return { status: 404, body: { message: 'Not found' } }
 *   return {
 *     status: 200,
 *     body: (async function* () {
 *       yield { event: 'update', data: user }
 *     })(),
 *   }
 * }
 * ```
 */
export type InferApiHandler<Contract extends ApiContract> = [
  ContractResponseMode<Contract['responsesByStatusCode']>,
] extends ['non-sse']
  ? (
      request: InferApiHandlerRequest<Contract>,
      reply: ApiHandlerReply,
    ) => MaybePromise<InferApiHandlerResult<Contract>>
  : (
      request: InferApiHandlerRequest<Contract>,
      reply: ApiHandlerReply,
      sse: SSEContext<InferSseSuccessResponses<Contract['responsesByStatusCode']>>,
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
     * the Fastify route options as a base — useful for cross-cutting concerns (auth,
     * rate limiting, tracing) driven by metadata declared on the contract.
     */
    contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper
  }
