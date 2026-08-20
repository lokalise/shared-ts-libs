import type { ZodSchema, z } from 'zod/v4'
import type { HttpStatusCode } from './HttpStatusCodes.ts'
import type { MayOmit } from './typeUtils.ts'

const EMPTY_PARAMS = {}

export type InferSchemaInput<T extends ZodSchema | undefined> = T extends ZodSchema
  ? z.input<T>
  : T extends undefined
    ? undefined
    : never

export type InferSchemaOutput<T extends ZodSchema | undefined> = T extends ZodSchema
  ? z.infer<T>
  : T extends undefined
    ? undefined
    : never

export type RoutePathResolver<PathParams> = (pathParams: PathParams) => string

export interface CommonRouteDefinitionMetadata extends Record<string, unknown> {}

/**
 * Who a route is intended for.
 *
 * 'internal' marks routes (e.g. backend-for-frontend endpoints) that must not be part of
 * the published API surface: OpenAPI generators exclude them from the generated document.
 * It has no effect on runtime behavior — the route is registered and served as usual.
 */
export type RouteVisibility = 'public' | 'internal'

export type CommonRouteDefinition<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
> = {
  // Whether a non-JSON response body is expected; builders default it to false
  isNonJSONResponseExpected: IsNonJSONResponseExpected
  // Whether an empty response body is expected; builders default it to false (true for DELETE routes)
  isEmptyResponseExpected: IsEmptyResponseExpected
  successResponseBodySchema: ResponseBodySchema
  requestQuerySchema?: RequestQuerySchema
  /**
   * Schema for validating request headers.
   * Used to define and validate headers that the client must send with the request.
   *
   * @example
   * ```ts
   * requestHeaderSchema: z.object({
   *   'authorization': z.string(),
   *   'x-api-key': z.string()
   * })
   * ```
   */
  requestHeaderSchema?: RequestHeaderSchema
  /**
   * Schema for validating response headers.
   * Used to define and validate headers that the server will send in the response.
   * This is useful for documenting expected response headers (e.g., rate limit headers,
   * pagination headers, cache control headers) and can be used by clients to validate
   * the response they receive.
   *
   * @example
   * ```ts
   * responseHeaderSchema: z.object({
   *   'x-ratelimit-limit': z.string(),
   *   'x-ratelimit-remaining': z.string(),
   *   'x-ratelimit-reset': z.string()
   * })
   * ```
   */
  responseHeaderSchema?: ResponseHeaderSchema
  pathResolver: RoutePathResolver<InferSchemaOutput<PathParamsSchema>>
  requestPathParamsSchema?: PathParamsSchema
  // Who a route is intended for
  visibility: RouteVisibility
  responseSchemasByStatusCode?: ResponseSchemasByStatusCode
  metadata?: CommonRouteDefinitionMetadata

  /*
  The following fields are primarily consumed by OpenAPI generators,
  but can be utilized for other purposes as well
   */
  // Human-readable route description
  description?: string
  // Route name (used as a title)
  summary?: string
  // Used for organizing endpoints into groups
  tags?: readonly string[]
  /*
  The end of primarily OpenAPI fields
   */
}

export type PayloadRouteDefinition<
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
}

export type GetRouteDefinition<
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
  method: 'get'
}

export type DeleteRouteDefinition<
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
  method: 'delete'
}

/**
 * @deprecated Use `defineApiContract` instead. This function will be removed in a future version.
 * @example
 * ```typescript
 * // Before (deprecated):
 * const route = buildPayloadRoute({
 *   visibility: 'public',
 *   method: 'post',
 *   requestBodySchema: bodySchema,
 *   successResponseBodySchema: responseSchema,
 *   pathResolver: () => '/api/users',
 * })
 *
 * // After (recommended):
 * const route = defineApiContract({
 *   visibility: 'public',
 *   method: 'post',
 *   requestBodySchema: bodySchema,
 *   pathResolver: () => '/api/users',
 *   responsesByStatusCode: { 201: responseSchema },
 * })
 * ```
 */
export function buildPayloadRoute<
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
  params: MayOmit<
    PayloadRouteDefinition<
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
    'isEmptyResponseExpected' | 'isNonJSONResponseExpected'
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
> {
  return {
    isEmptyResponseExpected: params.isEmptyResponseExpected ?? (false as IsEmptyResponseExpected),
    isNonJSONResponseExpected:
      params.isNonJSONResponseExpected ?? (false as IsNonJSONResponseExpected),
    method: params.method,
    pathResolver: params.pathResolver,
    requestPathParamsSchema: params.requestPathParamsSchema,
    visibility: params.visibility,
    requestBodySchema: params.requestBodySchema,
    requestHeaderSchema: params.requestHeaderSchema,
    responseHeaderSchema: params.responseHeaderSchema,
    requestQuerySchema: params.requestQuerySchema,
    successResponseBodySchema: params.successResponseBodySchema,
    description: params.description,
    summary: params.summary,
    responseSchemasByStatusCode: params.responseSchemasByStatusCode,
    metadata: params.metadata,
    tags: params.tags,
  }
}

/**
 * @deprecated Use `defineApiContract` instead. This function will be removed in a future version.
 * @example
 * ```typescript
 * // Before (deprecated):
 * const route = buildGetRoute({
 *   visibility: 'public',
 *   successResponseBodySchema: responseSchema,
 *   pathResolver: () => '/api/users',
 * })
 *
 * // After (recommended):
 * const route = defineApiContract({
 *   visibility: 'public',
 *   method: 'get',
 *   pathResolver: () => '/api/users',
 *   responsesByStatusCode: { 200: responseSchema },
 * })
 * ```
 */
export function buildGetRoute<
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
  params: MayOmit<
    Omit<
      GetRouteDefinition<
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
    >,
    'isEmptyResponseExpected' | 'isNonJSONResponseExpected'
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
> {
  return {
    isEmptyResponseExpected: params.isEmptyResponseExpected ?? (false as IsEmptyResponseExpected),
    isNonJSONResponseExpected:
      params.isNonJSONResponseExpected ?? (false as IsNonJSONResponseExpected),
    method: 'get',
    pathResolver: params.pathResolver,
    requestPathParamsSchema: params.requestPathParamsSchema,
    visibility: params.visibility,
    requestHeaderSchema: params.requestHeaderSchema,
    responseHeaderSchema: params.responseHeaderSchema,
    requestQuerySchema: params.requestQuerySchema,
    successResponseBodySchema: params.successResponseBodySchema,
    description: params.description,
    summary: params.summary,
    responseSchemasByStatusCode: params.responseSchemasByStatusCode,
    metadata: params.metadata,
    tags: params.tags,
  }
}

/**
 * @deprecated Use `defineApiContract` instead. This function will be removed in a future version.
 * @example
 * ```typescript
 * // Before (deprecated):
 * const route = buildDeleteRoute({
 *   visibility: 'public',
 *   requestPathParamsSchema: z.object({ userId: z.string() }),
 *   pathResolver: (params) => `/api/users/${params.userId}`,
 * })
 *
 * // After (recommended):
 * const route = defineApiContract({
 *   visibility: 'public',
 *   method: 'delete',
 *   requestPathParamsSchema: z.object({ userId: z.string() }),
 *   pathResolver: ({ userId }) => `/api/users/${userId}`,
 *   responsesByStatusCode: { 204: noBodyResponse() },
 * })
 * ```
 */
export function buildDeleteRoute<
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
  params: MayOmit<
    Omit<
      DeleteRouteDefinition<
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
    >,
    'isEmptyResponseExpected' | 'isNonJSONResponseExpected'
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
> {
  return {
    isEmptyResponseExpected: params.isEmptyResponseExpected ?? (true as IsEmptyResponseExpected),
    isNonJSONResponseExpected:
      params.isNonJSONResponseExpected ?? (false as IsNonJSONResponseExpected),
    method: 'delete',
    pathResolver: params.pathResolver,
    requestPathParamsSchema: params.requestPathParamsSchema,
    visibility: params.visibility,
    requestHeaderSchema: params.requestHeaderSchema,
    responseHeaderSchema: params.responseHeaderSchema,
    requestQuerySchema: params.requestQuerySchema,
    successResponseBodySchema: params.successResponseBodySchema,
    description: params.description,
    summary: params.summary,
    responseSchemasByStatusCode: params.responseSchemasByStatusCode,
    metadata: params.metadata,
    tags: params.tags,
  }
}

/**
 * @deprecated Use `mapApiContractToPath` instead.
 * Maps a route definition to a path string of the format '/static-path-part/:path-param-value'.
 */
export function mapRouteToPath(
  // biome-ignore lint/suspicious/noExplicitAny: We don't care about types here, we just need Zod schema
  routeDefinition: CommonRouteDefinition<any, any, any, any, any, any, any, any>,
): string {
  if (!routeDefinition.requestPathParamsSchema) {
    return routeDefinition.pathResolver(EMPTY_PARAMS)
  }
  const shape = routeDefinition.requestPathParamsSchema.shape
  const resolverParams: Record<string, string> = {}
  for (const key of Object.keys(shape)) {
    resolverParams[key] = `:${key}`
  }

  return routeDefinition.pathResolver(resolverParams)
}

/**
 * @deprecated Use `describeApiContract` instead.
 */
export function describeContract(
  contract: // biome-ignore lint/suspicious/noExplicitAny: we accept any contract here
    | PayloadRouteDefinition<any, any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: we accept any contract here
    | GetRouteDefinition<any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: we accept any contract here
    | DeleteRouteDefinition<any, any, any, any, any, any, any, any>,
): string {
  return `${contract.method.toUpperCase()} ${mapRouteToPath(contract)}`
}
