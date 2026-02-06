import type { z } from 'zod/v4'
import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  PayloadRouteDefinition,
} from './apiContracts.ts'
import type { HttpStatusCode } from './HttpStatusCodes.ts'
import {
  buildRestContract,
  type DeleteContractConfig,
  type GetContractConfig,
  type PayloadContractConfig,
} from './rest/restContractBuilder.ts'
import type { DualModeContractDefinition } from './sse/dualModeContracts.ts'
import {
  buildSseContract,
  type DualModeGetContractConfig,
  type DualModePayloadContractConfig,
  type SSEGetContractConfig,
  type SSEPayloadContractConfig,
} from './sse/sseContractBuilders.ts'
import type { SSEContractDefinition } from './sse/sseContracts.ts'
import type { SSEEventSchemas } from './sse/sseTypes.ts'

// ============================================================================
// Unified Contract Builder
// ============================================================================

/**
 * Universal contract builder that creates either REST or SSE contracts based on configuration.
 *
 * This is a unified entry point that delegates to:
 * - `buildRestContract` when no `sseEvents` is provided
 * - `buildSseContract` when `sseEvents` is provided
 *
 * ## Contract Type Detection
 *
 * | `sseEvents` | `syncResponseBody` | `requestBody`/`requestBodySchema` | Result |
 * |-------------|-------------------|-----------------------------------|--------|
 * | ❌ | - | ❌ | REST GET |
 * | ❌ | - | ✅ (method: post/put/patch) | REST Payload |
 * | ❌ | - | ❌ (method: delete) | REST DELETE |
 * | ✅ | ❌ | ❌ | SSE-only GET |
 * | ✅ | ❌ | ✅ | SSE-only POST/PUT/PATCH |
 * | ✅ | ✅ | ❌ | Dual-mode GET |
 * | ✅ | ✅ | ✅ | Dual-mode POST/PUT/PATCH |
 *
 * @example
 * ```typescript
 * // REST GET route
 * const getUsers = buildContract({
 *   successResponseBodySchema: z.array(userSchema),
 *   pathResolver: () => '/api/users',
 * })
 *
 * // REST POST route
 * const createUser = buildContract({
 *   method: 'post',
 *   requestBodySchema: createUserSchema,
 *   successResponseBodySchema: userSchema,
 *   pathResolver: () => '/api/users',
 * })
 *
 * // REST DELETE route
 * const deleteUser = buildContract({
 *   method: 'delete',
 *   pathResolver: (params) => `/api/users/${params.userId}`,
 *   requestPathParamsSchema: z.object({ userId: z.string() }),
 * })
 *
 * // SSE-only streaming endpoint
 * const notifications = buildContract({
 *   pathResolver: () => '/api/notifications/stream',
 *   params: z.object({}),
 *   query: z.object({}),
 *   requestHeaders: z.object({}),
 *   sseEvents: {
 *     notification: z.object({ id: z.string(), message: z.string() }),
 *   },
 * })
 *
 * // Dual-mode endpoint (supports both JSON and SSE)
 * const chatCompletion = buildContract({
 *   method: 'post',
 *   pathResolver: () => '/api/chat/completions',
 *   params: z.object({}),
 *   query: z.object({}),
 *   requestHeaders: z.object({}),
 *   requestBody: z.object({ message: z.string() }),
 *   syncResponseBody: z.object({ reply: z.string() }),
 *   sseEvents: {
 *     chunk: z.object({ delta: z.string() }),
 *     done: z.object({ usage: z.object({ tokens: z.number() }) }),
 *   },
 * })
 * ```
 */

// ============================================================================
// REST Overloads (config types already include sseEvents?: never)
// ============================================================================

// Overload 1: REST GET route (no method, no requestBodySchema, no sseEvents)
export function buildContract<
  SuccessResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  config: GetContractConfig<
    SuccessResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
): GetRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  ResponseHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected,
  ResponseSchemasByStatusCode
>

// Overload 2: REST DELETE route (method: 'delete', no requestBodySchema, no sseEvents)
export function buildContract<
  SuccessResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  config: DeleteContractConfig<
    SuccessResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
): DeleteRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  ResponseHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected,
  ResponseSchemasByStatusCode
>

// Overload 3: REST Payload route (method: 'post'|'put'|'patch', has requestBodySchema, no sseEvents)
export function buildContract<
  RequestBodySchema extends z.Schema | undefined = undefined,
  SuccessResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  config: PayloadContractConfig<
    RequestBodySchema,
    SuccessResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
): PayloadRouteDefinition<
  RequestBodySchema,
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  ResponseHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected,
  ResponseSchemasByStatusCode
>

// ============================================================================
// SSE Overloads
// ============================================================================

// Overload 4: Dual-mode GET (has syncResponseBody + sseEvents, no requestBody)
export function buildContract<
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

// Overload 5: SSE GET (has sseEvents, no requestBody, no syncResponseBody)
export function buildContract<
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

// Overload 6: Dual-mode with requestBody (has syncResponseBody + sseEvents + requestBody)
export function buildContract<
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

// Overload 7: SSE with requestBody (has sseEvents + requestBody, no syncResponseBody)
export function buildContract<
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

// ============================================================================
// Implementation
// ============================================================================

export function buildContract(
  // biome-ignore lint/suspicious/noExplicitAny: Union of all config types
  config: any,
  // biome-ignore lint/suspicious/noExplicitAny: Return type depends on overload
): any {
  const hasSseEvents = 'sseEvents' in config && config.sseEvents !== undefined

  if (hasSseEvents) {
    // Delegate to SSE contract builder
    return buildSseContract(config)
  }

  // Delegate to REST contract builder
  return buildRestContract(config)
}
