import type { z } from 'zod/v4'
import type { RoutePathResolver } from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'
import type { SimplifiedDualModeContractDefinition } from './dualModeContracts.ts'
import type { SSEContractDefinition } from './sseContracts.ts'
import type { SSEEventSchemas } from './sseTypes.ts'

/**
 * Configuration for building a GET SSE route.
 * Forbids requestBody for GET variants.
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
  params: Params
  query: Query
  requestHeaders: RequestHeaders
  sseEvents: Events
  /**
   * Error response schemas by HTTP status code.
   * Used to define response shapes for errors that occur before streaming starts
   * (e.g., authentication failures, validation errors, not found).
   *
   * @example
   * ```ts
   * responseSchemasByStatusCode: {
   *   401: z.object({ error: z.literal('Unauthorized') }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseSchemasByStatusCode?: ResponseSchemasByStatusCode
  requestBody?: never
  syncResponseBody?: never
}

/**
 * Configuration for building a POST/PUT/PATCH SSE route with request requestBody.
 * Requires requestBody for payload variants.
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
  params: Params
  query: Query
  requestHeaders: RequestHeaders
  requestBody: Body
  sseEvents: Events
  /**
   * Error response schemas by HTTP status code.
   * Used to define response shapes for errors that occur before streaming starts
   * (e.g., authentication failures, validation errors, not found).
   *
   * @example
   * ```ts
   * responseSchemasByStatusCode: {
   *   401: z.object({ error: z.literal('Unauthorized') }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseSchemasByStatusCode?: ResponseSchemasByStatusCode
  syncResponseBody?: never
}

/**
 * Configuration for building a GET dual-mode route.
 * Requires syncResponseBody, forbids requestBody.
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
  params: Params
  query: Query
  requestHeaders: RequestHeaders
  /** Single sync response schema */
  syncResponseBody: JsonResponse
  /**
   * Schema for validating response headers (sync mode only).
   * Used to define and validate headers that the server will send in the response.
   *
   * @example
   * ```ts
   * responseHeaders: z.object({
   *   'x-ratelimit-limit': z.string(),
   *   'x-ratelimit-remaining': z.string(),
   * })
   * ```
   */
  responseHeaders?: ResponseHeaders
  /**
   * Alternative response schemas by HTTP status code.
   * Used to define different response shapes for error cases.
   *
   * @example
   * ```ts
   * responseSchemasByStatusCode: {
   *   400: z.object({ error: z.string(), details: z.array(z.string()) }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseSchemasByStatusCode?: ResponseSchemasByStatusCode
  sseEvents: Events
  requestBody?: never
}

/**
 * Configuration for building a POST/PUT/PATCH dual-mode route with request requestBody.
 * Requires both requestBody and syncResponseBody.
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
  params: Params
  query: Query
  requestHeaders: RequestHeaders
  requestBody: Body
  /** Single sync response schema */
  syncResponseBody: JsonResponse
  /**
   * Schema for validating response headers (sync mode only).
   * Used to define and validate headers that the server will send in the response.
   *
   * @example
   * ```ts
   * responseHeaders: z.object({
   *   'x-ratelimit-limit': z.string(),
   *   'x-ratelimit-remaining': z.string(),
   * })
   * ```
   */
  responseHeaders?: ResponseHeaders
  /**
   * Alternative response schemas by HTTP status code.
   * Used to define different response shapes for error cases.
   *
   * @example
   * ```ts
   * responseSchemasByStatusCode: {
   *   400: z.object({ error: z.string(), details: z.array(z.string()) }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseSchemasByStatusCode?: ResponseSchemasByStatusCode
  sseEvents: Events
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
 * The contract type is automatically determined based on the presence of `syncResponseBody`:
 *
 * | `syncResponseBody` | `requestBody` | Result |
 * |--------------------|---------------|--------|
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
 *   params: z.object({}),
 *   query: z.object({ userId: z.string().optional() }),
 *   requestHeaders: z.object({}),
 *   sseEvents: {
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
 *   params: z.object({}),
 *   query: z.object({}),
 *   requestHeaders: z.object({}),
 *   requestBody: z.object({ message: z.string() }),
 *   syncResponseBody: z.object({ reply: z.string(), usage: z.object({ tokens: z.number() }) }),
 *   sseEvents: {
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
    params: config.params,
    query: config.query,
    requestHeaders: config.requestHeaders,
    requestBody: hasBody ? config.requestBody : undefined,
    sseEvents: config.sseEvents,
  }
}

// Helper to determine method
function determineMethod(config: { method?: string }, hasBody: boolean, defaultMethod: string) {
  return hasBody ? (config.method ?? defaultMethod) : 'get'
}

// Overload 1: Dual-mode with requestBody (has syncResponseBody + requestBody)
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
): SimplifiedDualModeContractDefinition<
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

// Overload 2: Dual-mode GET (has syncResponseBody, requestBody?: never)
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
): SimplifiedDualModeContractDefinition<
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

// Overload 3: SSE with requestBody (has requestBody, no response configs)
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

// Overload 4: SSE GET (no requestBody, no response configs)
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
  const hasSyncResponseBody = 'syncResponseBody' in config && config.syncResponseBody !== undefined
  const hasBody = 'requestBody' in config && config.requestBody !== undefined
  const base = buildBaseFields(config, hasBody)

  if (hasSyncResponseBody) {
    // Dual-mode contract
    return {
      ...base,
      method: determineMethod(config as { method?: string }, hasBody, 'post'),
      syncResponseBody: (config as { syncResponseBody: unknown }).syncResponseBody,
      responseHeaders: (config as { responseHeaders?: unknown }).responseHeaders,
      responseSchemasByStatusCode: (config as { responseSchemasByStatusCode?: unknown })
        .responseSchemasByStatusCode,
      isDualMode: true,
      isSimplified: true,
    }
  }

  // SSE-only contract
  return {
    ...base,
    method: determineMethod(config as { method?: string }, hasBody, 'post'),
    responseSchemasByStatusCode: (config as { responseSchemasByStatusCode?: unknown })
      .responseSchemasByStatusCode,
    isSSE: true,
  }
}
