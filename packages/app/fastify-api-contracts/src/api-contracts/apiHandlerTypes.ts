import type { Readable } from 'node:stream'
import type {
  ApiContract,
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
export type InferApiStatusResponse<TApiContract extends ApiContract> = {
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
export type InferApiRequest<Contract extends ApiContract> = FastifyRequest<{
  Params: InferOptSchema<Contract['requestPathParamsSchema']>
  Querystring: InferOptSchema<Contract['requestQuerySchema']>
  Headers: InferOptSchema<Contract['requestHeaderSchema']>
  Body: InferApiBodyType<Contract>
}>

type MaybePromise<T> = T | Promise<T>

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
      request: InferApiRequest<Contract>,
      reply: SyncModeReply,
    ) => MaybePromise<InferApiStatusResponse<Contract>>
  : (
      request: InferApiRequest<Contract>,
      reply: SyncModeReply,
      sse: SSEContext<InferSseSuccessResponses<Contract['responsesByStatusCode']>>,
      // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional — handler returns nothing after sse.start()
    ) => MaybePromise<InferApiStatusResponse<Contract> | void>

/**
 * Extra options for an `ApiContract` route: any Fastify `RouteOptions` field except the ones
 * the contract provides (`method`, `url`, `schema`, `handler`, `sse`), plus the SSE lifecycle
 * options (`onConnect`/`onClose`/`onReconnect`, …) that apply only to SSE-capable contracts.
 */
export type ApiRouteOptions = Omit<RouteOptions, 'method' | 'url' | 'schema' | 'handler' | 'sse'> &
  FastifySSERouteOptions
