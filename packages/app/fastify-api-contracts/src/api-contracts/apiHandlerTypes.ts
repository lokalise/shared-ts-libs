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
  DualModeType,
  FastifySSERouteOptions,
  SSEContext,
  SSEHandlerResult,
  SyncModeReply,
} from './sseTypes.ts'

// ============================================================================
// Status+Body Response
// ============================================================================

type NonSseBodyEntry<T> = T extends undefined
  ? never
  : T extends { _tag: 'SseResponse' }
    ? never
    : T extends { _tag: 'BlobResponse' }
      ? Blob
      : T extends { _tag: 'TextResponse' }
        ? string
        : T extends { _tag: 'AnyOfResponses'; responses: Array<infer R> }
          ? NonSseBodyEntry<R>
          : T extends z.ZodType
            ? z.output<T>
            : undefined

/**
 * Discriminated union of `{ status, body }` pairs for all non-SSE responses in a contract.
 *
 * Allows non-SSE handlers to return a specific status code and body together without
 * calling `reply.code()` separately.
 *
 * @example
 * ```typescript
 * async (request) => {
 *   if (!valid) return { status: 400, body: { error: 'Bad Request' } }
 *   return { status: 200, body: { id: request.params.id } }
 * }
 * ```
 */
export type InferApiStatusResponse<Contract extends ApiContract> = {
  [K in keyof Contract['responsesByStatusCode']]: NonSseBodyEntry<
    Contract['responsesByStatusCode'][K]
  > extends never
    ? never
    : { status: K; body: NonSseBodyEntry<Contract['responsesByStatusCode'][K]> }
}[keyof Contract['responsesByStatusCode']]

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
 * Handler for non-SSE responses from an `ApiContract`.
 *
 * Always return `{ status, body }` — the framework validates the body against the
 * contract's schema for that status code and sends it.
 *
 * Use `reply.header()` to set response headers when needed.
 *
 * @example
 * ```typescript
 * async (request) => ({ status: 200, body: { id: request.params.userId } })
 * ```
 */
export type ApiNonSseHandler<Contract extends ApiContract> = (
  request: InferApiRequest<Contract>,
  reply: SyncModeReply,
) => InferApiStatusResponse<Contract> | Promise<InferApiStatusResponse<Contract>>

/**
 * Handler for SSE responses from an `ApiContract`.
 *
 * Call `sse.start(mode)` to begin streaming or `sse.respond(code, body)` for
 * early HTTP returns before streaming starts.
 */
export type ApiSseHandler<Contract extends ApiContract> = (
  request: InferApiRequest<Contract>,
  sse: SSEContext<InferSseSuccessResponses<Contract['responsesByStatusCode']>>,
) => SSEHandlerResult | Promise<SSEHandlerResult>

/**
 * Infer the handler shape based on the contract's response mode:
 * - `'non-sse'` — bare `ApiNonSseHandler` function
 * - `'sse'`     — bare `ApiSseHandler` function
 * - `'dual'`    — `{ nonSse, sse }` object, branched by the `Accept` header
 */
export type InferApiHandler<Contract extends ApiContract> = [
  ContractResponseMode<Contract['responsesByStatusCode']>,
] extends ['dual']
  ? { nonSse: ApiNonSseHandler<Contract>; sse: ApiSseHandler<Contract> }
  : [ContractResponseMode<Contract['responsesByStatusCode']>] extends ['sse']
    ? ApiSseHandler<Contract>
    : ApiNonSseHandler<Contract>

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
  Omit<FastifySSERouteOptions, 'preHandler'> & {
    /**
     * Default response mode for dual-mode routes when the `Accept` header does
     * not express a preference.
     * @default 'json'
     */
    defaultMode?: DualModeType
  }
