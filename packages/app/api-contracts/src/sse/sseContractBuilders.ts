import type { z } from 'zod/v4'
import type { RoutePathResolver } from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'
import type { DualModeContractDefinition } from './dualModeContracts.ts'
import type { SSEContractDefinition } from './sseContracts.ts'
import type { SSEEventSchemas } from './sseTypes.ts'

/**
 * Configuration for building a GET SSE route.
 * Forbids requestBodySchema for GET variants.
 */
export type SSEGetContractConfig<
  Params extends z.ZodTypeAny,
  Query extends z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny,
  Events extends SSEEventSchemas,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
> = {
  pathResolver: RoutePathResolver<z.infer<Params>>
  requestPathParamsSchema: Params
  requestQuerySchema: Query
  requestHeaderSchema: RequestHeaders
  serverSentEvents: Events
  /**
   * Error response schemas by HTTP status code.
   * Used to define response shapes for errors that occur before streaming starts
   * (e.g., authentication failures, validation errors, not found).
   *
   * @example
   * ```ts
   * responseBodySchemasByStatusCode: {
   *   401: z.object({ error: z.literal('Unauthorized') }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseBodySchemasByStatusCode?: ResponseSchemasByStatusCode
  requestBodySchema?: never
  successResponseBodySchema?: never
}

/**
 * Configuration for building a POST/PUT/PATCH SSE route with request body.
 * Requires requestBodySchema for payload variants.
 */
export type SSEPayloadContractConfig<
  Params extends z.ZodTypeAny,
  Query extends z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny,
  Body extends z.ZodTypeAny,
  Events extends SSEEventSchemas,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
> = {
  method?: 'post' | 'put' | 'patch'
  pathResolver: RoutePathResolver<z.infer<Params>>
  requestPathParamsSchema: Params
  requestQuerySchema: Query
  requestHeaderSchema: RequestHeaders
  requestBodySchema: Body
  serverSentEvents: Events
  /**
   * Error response schemas by HTTP status code.
   * Used to define response shapes for errors that occur before streaming starts
   * (e.g., authentication failures, validation errors, not found).
   *
   * @example
   * ```ts
   * responseBodySchemasByStatusCode: {
   *   401: z.object({ error: z.literal('Unauthorized') }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseBodySchemasByStatusCode?: ResponseSchemasByStatusCode
  successResponseBodySchema?: never
}

/**
 * Configuration for building a GET dual-mode route.
 * Requires successResponseBodySchema, forbids requestBodySchema.
 */
export type DualModeGetContractConfig<
  Params extends z.ZodTypeAny,
  Query extends z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny,
  JsonResponse extends z.ZodTypeAny,
  Events extends SSEEventSchemas,
  ResponseHeaders extends z.ZodTypeAny | undefined = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
> = {
  pathResolver: RoutePathResolver<z.infer<Params>>
  requestPathParamsSchema: Params
  requestQuerySchema: Query
  requestHeaderSchema: RequestHeaders
  /** Single sync response schema */
  successResponseBodySchema: JsonResponse
  /**
   * Schema for validating response headers (sync mode only).
   * Used to define and validate headers that the server will send in the response.
   *
   * @example
   * ```ts
   * responseHeaderSchema: z.object({
   *   'x-ratelimit-limit': z.string(),
   *   'x-ratelimit-remaining': z.string(),
   * })
   * ```
   */
  responseHeaderSchema?: ResponseHeaders
  /**
   * Alternative response schemas by HTTP status code.
   * Used to define different response shapes for error cases.
   *
   * @example
   * ```ts
   * responseBodySchemasByStatusCode: {
   *   400: z.object({ error: z.string(), details: z.array(z.string()) }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseBodySchemasByStatusCode?: ResponseSchemasByStatusCode
  serverSentEvents: Events
  requestBodySchema?: never
}

/**
 * Configuration for building a POST/PUT/PATCH dual-mode route with request body.
 * Requires both requestBodySchema and successResponseBodySchema.
 */
export type DualModePayloadContractConfig<
  Params extends z.ZodTypeAny,
  Query extends z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny,
  Body extends z.ZodTypeAny,
  JsonResponse extends z.ZodTypeAny,
  Events extends SSEEventSchemas,
  ResponseHeaders extends z.ZodTypeAny | undefined = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
> = {
  method?: 'post' | 'put' | 'patch'
  pathResolver: RoutePathResolver<z.infer<Params>>
  requestPathParamsSchema: Params
  requestQuerySchema: Query
  requestHeaderSchema: RequestHeaders
  requestBodySchema: Body
  /** Single sync response schema */
  successResponseBodySchema: JsonResponse
  /**
   * Schema for validating response headers (sync mode only).
   * Used to define and validate headers that the server will send in the response.
   *
   * @example
   * ```ts
   * responseHeaderSchema: z.object({
   *   'x-ratelimit-limit': z.string(),
   *   'x-ratelimit-remaining': z.string(),
   * })
   * ```
   */
  responseHeaderSchema?: ResponseHeaders
  /**
   * Alternative response schemas by HTTP status code.
   * Used to define different response shapes for error cases.
   *
   * @example
   * ```ts
   * responseBodySchemasByStatusCode: {
   *   400: z.object({ error: z.string(), details: z.array(z.string()) }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseBodySchemasByStatusCode?: ResponseSchemasByStatusCode
  serverSentEvents: Events
}

/**
 * Builds SSE (Server-Sent Events) and dual-mode contracts.
 *
 * This builder supports two contract types:
 *
 * **SSE-only contracts**: Pure streaming endpoints that only return SSE events.
 * Use these for real-time notifications, live feeds, or any endpoint that only streams data.
 *
 * **Dual-mode contracts**: Hybrid endpoints that support both synchronous JSON responses
 * AND SSE streaming from the same URL. The response mode is determined by the client's
 * `Accept` header (`application/json` for sync, `text/event-stream` for SSE).
 * This is ideal for AI/LLM APIs (like OpenAI) where clients can choose between
 * getting the full response at once or streaming it token-by-token.
 *
 * The contract type is automatically determined based on the presence of `successResponseBodySchema`:
 *
 * | `successResponseBodySchema` | `requestBodySchema` | Result |
 * |----------------------------|---------------------|--------|
 * | ❌ | ❌ | SSE-only GET |
 * | ❌ | ✅ | SSE-only POST/PUT/PATCH |
 * | ✅ | ❌ | Dual-mode GET |
 * | ✅ | ✅ | Dual-mode POST/PUT/PATCH |
 *
 * @example
 * ```typescript
 * // SSE-only: Pure streaming endpoint (e.g., live notifications)
 * const notificationsStream = buildSseContract({
 *   pathResolver: () => '/api/notifications/stream',
 *   requestPathParamsSchema: z.object({}),
 *   requestQuerySchema: z.object({ userId: z.string().optional() }),
 *   requestHeaderSchema: z.object({}),
 *   serverSentEvents: {
 *     notification: z.object({ id: z.string(), message: z.string() }),
 *   },
 * })
 *
 * // Dual-mode: Same endpoint supports both JSON and SSE (e.g., OpenAI-style API)
 * // - Accept: application/json → returns { reply, usage } immediately
 * // - Accept: text/event-stream → streams chunk events, then done event
 * const chatCompletion = buildSseContract({
 *   method: 'POST',
 *   pathResolver: () => '/api/chat/completions',
 *   requestPathParamsSchema: z.object({}),
 *   requestQuerySchema: z.object({}),
 *   requestHeaderSchema: z.object({}),
 *   requestBodySchema: z.object({ message: z.string() }),
 *   successResponseBodySchema: z.object({ reply: z.string(), usage: z.object({ tokens: z.number() }) }),
 *   serverSentEvents: {
 *     chunk: z.object({ delta: z.string() }),
 *     done: z.object({ usage: z.object({ total: z.number() }) }),
 *   },
 * })
 * ```
 */

// Helper to build base contract fields
// biome-ignore lint/suspicious/noExplicitAny: Config union type
function buildBaseFields(config: any, hasBody: boolean) {
  return {
    pathResolver: config.pathResolver,
    requestPathParamsSchema: config.requestPathParamsSchema,
    requestQuerySchema: config.requestQuerySchema,
    requestHeaderSchema: config.requestHeaderSchema,
    requestBodySchema: hasBody ? config.requestBodySchema : undefined,
    serverSentEvents: config.serverSentEvents,
  }
}

// Helper to determine method
function determineMethod(config: { method?: string }, hasBody: boolean, defaultMethod: string) {
  return hasBody ? (config.method ?? defaultMethod) : 'get'
}

// Overload 1: Dual-mode GET (has successResponseBodySchema, no requestBodySchema)
export function buildSseContract<
  Params extends z.ZodTypeAny,
  Query extends z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny,
  JsonResponse extends z.ZodTypeAny,
  Events extends SSEEventSchemas,
  ResponseHeaders extends z.ZodTypeAny | undefined = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
>(
  config: DualModeGetContractConfig<
    Params,
    Query,
    RequestHeaders,
    JsonResponse,
    Events,
    ResponseHeaders,
    ResponseSchemasByStatusCode
  >,
): DualModeContractDefinition<
  'get',
  Params,
  Query,
  RequestHeaders,
  undefined,
  JsonResponse,
  Events,
  ResponseHeaders,
  ResponseSchemasByStatusCode
>

// Overload 2: SSE GET (no requestBodySchema, no successResponseBodySchema)
export function buildSseContract<
  Params extends z.ZodTypeAny,
  Query extends z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny,
  Events extends SSEEventSchemas,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
>(
  config: SSEGetContractConfig<Params, Query, RequestHeaders, Events, ResponseSchemasByStatusCode>,
): SSEContractDefinition<
  'get',
  Params,
  Query,
  RequestHeaders,
  undefined,
  Events,
  ResponseSchemasByStatusCode
>

// Overload 3: Dual-mode with body (has successResponseBodySchema + requestBodySchema)
export function buildSseContract<
  Params extends z.ZodTypeAny,
  Query extends z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny,
  Body extends z.ZodTypeAny,
  JsonResponse extends z.ZodTypeAny,
  Events extends SSEEventSchemas,
  ResponseHeaders extends z.ZodTypeAny | undefined = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
>(
  config: DualModePayloadContractConfig<
    Params,
    Query,
    RequestHeaders,
    Body,
    JsonResponse,
    Events,
    ResponseHeaders,
    ResponseSchemasByStatusCode
  >,
): DualModeContractDefinition<
  'post' | 'put' | 'patch',
  Params,
  Query,
  RequestHeaders,
  Body,
  JsonResponse,
  Events,
  ResponseHeaders,
  ResponseSchemasByStatusCode
>

// Overload 4: SSE with body (has requestBodySchema, no successResponseBodySchema)
export function buildSseContract<
  Params extends z.ZodTypeAny,
  Query extends z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny,
  Body extends z.ZodTypeAny,
  Events extends SSEEventSchemas,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
>(
  config: SSEPayloadContractConfig<
    Params,
    Query,
    RequestHeaders,
    Body,
    Events,
    ResponseSchemasByStatusCode
  >,
): SSEContractDefinition<
  'post' | 'put' | 'patch',
  Params,
  Query,
  RequestHeaders,
  Body,
  Events,
  ResponseSchemasByStatusCode
>

// Implementation
export function buildSseContract(
  config: // biome-ignore lint/suspicious/noExplicitAny: Union of all config types
    | DualModePayloadContractConfig<any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: Union of all config types
    | DualModeGetContractConfig<any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: Union of all config types
    | SSEPayloadContractConfig<any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: Union of all config types
    | SSEGetContractConfig<any, any, any, any, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Return type depends on overload
): any {
  const hasSyncResponseBody =
    'successResponseBodySchema' in config && config.successResponseBodySchema !== undefined
  const hasBody = 'requestBodySchema' in config && config.requestBodySchema !== undefined
  const base = buildBaseFields(config, hasBody)

  if (hasSyncResponseBody) {
    // Dual-mode contract
    return {
      ...base,
      method: determineMethod(config as { method?: string }, hasBody, 'post'),
      successResponseBodySchema: (config as { successResponseBodySchema: unknown })
        .successResponseBodySchema,
      responseHeaderSchema: (config as { responseHeaderSchema?: unknown }).responseHeaderSchema,
      responseBodySchemasByStatusCode: (config as { responseBodySchemasByStatusCode?: unknown })
        .responseBodySchemasByStatusCode,
      isDualMode: true,
    }
  }

  // SSE-only contract
  return {
    ...base,
    method: determineMethod(config as { method?: string }, hasBody, 'post'),
    responseBodySchemasByStatusCode: (config as { responseBodySchemasByStatusCode?: unknown })
      .responseBodySchemasByStatusCode,
    isSSE: true,
  }
}
