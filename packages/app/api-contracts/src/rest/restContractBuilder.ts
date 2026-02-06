import type { z } from 'zod/v4'
import type {
  CommonRouteDefinition,
  DeleteRouteDefinition,
  GetRouteDefinition,
  PayloadRouteDefinition,
} from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'

// ============================================================================
// Unified REST Contract Builder - Configuration Types
// ============================================================================

/**
 * Configuration for building a GET route.
 * GET routes have no request body and the method is inferred automatically.
 */
export type GetContractConfig<
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
> = Omit<
  CommonRouteDefinition<
    SuccessResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
  'method'
> & {
  method?: never
  requestBodySchema?: never
  /** Discriminator to distinguish from SSE contracts in buildContract */
  sseEvents?: never
}

/**
 * Configuration for building a DELETE route.
 * DELETE routes have no request body and default to empty response expected.
 */
export type DeleteContractConfig<
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
> = Omit<
  CommonRouteDefinition<
    SuccessResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
  'method'
> & {
  method: 'delete'
  requestBodySchema?: never
  /** Discriminator to distinguish from SSE contracts in buildContract */
  sseEvents?: never
}

/**
 * Configuration for building a payload route (POST, PUT, PATCH).
 * Payload routes require a request body and an explicit method.
 */
export type PayloadContractConfig<
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
> = CommonRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  ResponseHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected,
  ResponseSchemasByStatusCode
> & {
  method: 'post' | 'put' | 'patch'
  requestBodySchema: RequestBodySchema
  /** Discriminator to distinguish from SSE contracts in buildContract */
  sseEvents?: never
}

// ============================================================================
// Unified REST Contract Builder
// ============================================================================

/**
 * Builds REST API contracts with automatic type inference.
 *
 * This unified builder replaces the individual `buildGetRoute`, `buildPayloadRoute`,
 * and `buildDeleteRoute` functions, providing a single entry point for all REST contracts.
 *
 * The contract type is automatically determined based on the configuration:
 *
 * | `method` | `requestBodySchema` | Result |
 * |----------|---------------------|--------|
 * | omitted/undefined | ❌ | GET route |
 * | `'delete'` | ❌ | DELETE route |
 * | `'post'`/`'put'`/`'patch'` | ✅ | Payload route |
 *
 * @example
 * ```typescript
 * // GET route - method is inferred automatically
 * const getUsers = buildRestContract({
 *   pathResolver: () => '/api/users',
 *   successResponseBodySchema: z.array(userSchema),
 * })
 *
 * // GET route with path params
 * const getUser = buildRestContract({
 *   pathResolver: (params) => `/api/users/${params.userId}`,
 *   requestPathParamsSchema: z.object({ userId: z.string() }),
 *   successResponseBodySchema: userSchema,
 * })
 *
 * // POST route - requires method and requestBodySchema
 * const createUser = buildRestContract({
 *   method: 'post',
 *   pathResolver: () => '/api/users',
 *   requestBodySchema: createUserSchema,
 *   successResponseBodySchema: userSchema,
 * })
 *
 * // PUT route
 * const updateUser = buildRestContract({
 *   method: 'put',
 *   pathResolver: (params) => `/api/users/${params.userId}`,
 *   requestPathParamsSchema: z.object({ userId: z.string() }),
 *   requestBodySchema: updateUserSchema,
 *   successResponseBodySchema: userSchema,
 * })
 *
 * // PATCH route
 * const patchUser = buildRestContract({
 *   method: 'patch',
 *   pathResolver: (params) => `/api/users/${params.userId}`,
 *   requestPathParamsSchema: z.object({ userId: z.string() }),
 *   requestBodySchema: patchUserSchema,
 *   successResponseBodySchema: userSchema,
 * })
 *
 * // DELETE route - method is 'delete', no body
 * const deleteUser = buildRestContract({
 *   method: 'delete',
 *   pathResolver: (params) => `/api/users/${params.userId}`,
 *   requestPathParamsSchema: z.object({ userId: z.string() }),
 *   successResponseBodySchema: z.undefined(),
 * })
 * ```
 */

// Overload 1: GET route (no method, no requestBodySchema)
export function buildRestContract<
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

// Overload 2: DELETE route (method: 'delete', no requestBodySchema)
export function buildRestContract<
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

// Overload 3: Payload route (method: 'post'|'put'|'patch', has requestBodySchema)
export function buildRestContract<
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

// Implementation
export function buildRestContract(
  config: // biome-ignore lint/suspicious/noExplicitAny: Union of all config types
    | GetContractConfig<any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: Union of all config types
    | DeleteContractConfig<any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: Union of all config types
    | PayloadContractConfig<any, any, any, any, any, any, any, any, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Return type depends on overload
): any {
  const method = config.method
  const hasBody = 'requestBodySchema' in config && config.requestBodySchema !== undefined

  // Determine default for isEmptyResponseExpected based on route type
  const isDeleteRoute = method === 'delete'
  const defaultIsEmptyResponseExpected = isDeleteRoute

  const baseFields = {
    isEmptyResponseExpected: config.isEmptyResponseExpected ?? defaultIsEmptyResponseExpected,
    isNonJSONResponseExpected: config.isNonJSONResponseExpected ?? false,
    pathResolver: config.pathResolver,
    requestHeaderSchema: config.requestHeaderSchema,
    responseHeaderSchema: config.responseHeaderSchema,
    requestPathParamsSchema: config.requestPathParamsSchema,
    requestQuerySchema: config.requestQuerySchema,
    successResponseBodySchema: config.successResponseBodySchema,
    description: config.description,
    summary: config.summary,
    responseSchemasByStatusCode: config.responseSchemasByStatusCode,
    metadata: config.metadata,
    tags: config.tags,
  }

  if (hasBody) {
    // Payload route (POST/PUT/PATCH)
    return {
      ...baseFields,
      method: method as 'post' | 'put' | 'patch',
      // biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for config union
      requestBodySchema: (config as PayloadContractConfig<any>).requestBodySchema,
    }
  }

  if (isDeleteRoute) {
    // DELETE route
    return {
      ...baseFields,
      method: 'delete' as const,
    }
  }

  // GET route (default)
  return {
    ...baseFields,
    method: 'get' as const,
  }
}
