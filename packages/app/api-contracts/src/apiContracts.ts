import type { ZodSchema, z } from 'zod/v4'
import type { AnyDeleteRoute, AnyGetRoute, AnyPayloadRoute } from './contractService.js'
import type { HttpStatusCode } from './HttpStatusCodes.ts'

export type { HttpStatusCode }

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

export type CommonRouteDefinition<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
> = {
  isNonJSONResponseExpected?: IsNonJSONResponseExpected
  isEmptyResponseExpected?: IsEmptyResponseExpected
  successResponseBodySchema: ResponseBodySchema
  requestPathParamsSchema?: PathParamsSchema
  requestQuerySchema?: RequestQuerySchema
  requestHeaderSchema?: RequestHeaderSchema
  pathResolver: RoutePathResolver<InferSchemaOutput<PathParamsSchema>>
  responseSchemasByStatusCode?: Partial<Record<HttpStatusCode, z.Schema>>
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
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
> = CommonRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected
> & {
  method: 'post' | 'put' | 'patch'
  requestBodySchema: RequestBodySchema
}

export type GetRouteDefinition<
  SuccessResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
> = CommonRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected
> & {
  method: 'get'
}

export type DeleteRouteDefinition<
  SuccessResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
> = CommonRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected
> & {
  method: 'delete'
}

export function buildPayloadRoute<
  RequestBodySchema extends z.Schema | undefined = undefined,
  SuccessResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  params: PayloadRouteDefinition<
    RequestBodySchema,
    SuccessResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
): PayloadRouteDefinition<
  RequestBodySchema,
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected
> {
  return {
    isEmptyResponseExpected: params.isEmptyResponseExpected ?? (false as IsEmptyResponseExpected),
    isNonJSONResponseExpected:
      params.isNonJSONResponseExpected ?? (false as IsNonJSONResponseExpected),
    method: params.method,
    pathResolver: params.pathResolver,
    requestBodySchema: params.requestBodySchema,
    requestHeaderSchema: params.requestHeaderSchema,
    requestPathParamsSchema: params.requestPathParamsSchema,
    requestQuerySchema: params.requestQuerySchema,
    successResponseBodySchema: params.successResponseBodySchema,
    description: params.description,
    summary: params.summary,
    responseSchemasByStatusCode: params.responseSchemasByStatusCode,
    metadata: params.metadata,
    tags: params.tags,
  }
}

export function buildGetRoute<
  SuccessResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  params: Omit<
    GetRouteDefinition<
      SuccessResponseBodySchema,
      PathParamsSchema,
      RequestQuerySchema,
      RequestHeaderSchema,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected
    >,
    'method'
  >,
): GetRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected
> {
  return {
    isEmptyResponseExpected: params.isEmptyResponseExpected ?? (false as IsEmptyResponseExpected),
    isNonJSONResponseExpected:
      params.isNonJSONResponseExpected ?? (false as IsNonJSONResponseExpected),
    method: 'get',
    pathResolver: params.pathResolver,
    requestHeaderSchema: params.requestHeaderSchema,
    requestPathParamsSchema: params.requestPathParamsSchema,
    requestQuerySchema: params.requestQuerySchema,
    successResponseBodySchema: params.successResponseBodySchema,
    description: params.description,
    summary: params.summary,
    responseSchemasByStatusCode: params.responseSchemasByStatusCode,
    metadata: params.metadata,
    tags: params.tags,
  }
}

export function buildDeleteRoute<
  SuccessResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
>(
  params: Omit<
    DeleteRouteDefinition<
      SuccessResponseBodySchema,
      PathParamsSchema,
      RequestQuerySchema,
      RequestHeaderSchema,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected
    >,
    'method'
  >,
): DeleteRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected
> {
  return {
    isEmptyResponseExpected: params.isEmptyResponseExpected ?? (true as IsEmptyResponseExpected),
    isNonJSONResponseExpected:
      params.isNonJSONResponseExpected ?? (false as IsNonJSONResponseExpected),
    method: 'delete',
    pathResolver: params.pathResolver,
    requestHeaderSchema: params.requestHeaderSchema,
    requestPathParamsSchema: params.requestPathParamsSchema,
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
 * This method maps given route definition to a string of the format '/static-path-part/:path-param-value'
 */
export function mapRouteToPath(
  // biome-ignore lint/suspicious/noExplicitAny: We don't care about types here, we just need Zod schema
  routeDefinition: CommonRouteDefinition<any, any, any, any, any, any>,
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

export type InferGetDetails<Route extends AnyGetRoute> = Route extends GetRouteDefinition<
  infer SuccessResponseBodySchema,
  infer PathParamsSchema,
  infer RequestQuerySchema,
  infer RequestHeaderSchema,
  infer IsNonJSONResponseExpected,
  infer IsEmptyResponseExpected
>
  ? {
      responseBodySchema: SuccessResponseBodySchema
      pathParamsSchema: PathParamsSchema
      requestQuerySchema: RequestQuerySchema
      requestHeaderSchema: RequestHeaderSchema
      isNonJSONResponseExpected: IsNonJSONResponseExpected
      isEmptyResponseExpected: IsEmptyResponseExpected
    }
  : never

export type InferDeleteDetails<Route extends AnyDeleteRoute> = Route extends DeleteRouteDefinition<
  infer SuccessResponseBodySchema,
  infer PathParamsSchema,
  infer RequestQuerySchema,
  infer RequestHeaderSchema,
  infer IsNonJSONResponseExpected,
  infer IsEmptyResponseExpected
>
  ? {
      responseBodySchema: SuccessResponseBodySchema
      pathParamsSchema: PathParamsSchema
      requestQuerySchema: RequestQuerySchema
      requestHeaderSchema: RequestHeaderSchema
      isNonJSONResponseExpected: IsNonJSONResponseExpected
      isEmptyResponseExpected: IsEmptyResponseExpected
    }
  : never

export type InferPayloadDetails<Route extends AnyPayloadRoute> =
  Route extends PayloadRouteDefinition<
    infer RequestBodySchema,
    infer SuccessResponseBodySchema,
    infer PathParamsSchema,
    infer RequestQuerySchema,
    infer RequestHeaderSchema,
    infer IsNonJSONResponseExpected,
    infer IsEmptyResponseExpected
  >
    ? {
        requestBodySchema: RequestBodySchema
        responseBodySchema: SuccessResponseBodySchema
        pathParamsSchema: PathParamsSchema
        requestQuerySchema: RequestQuerySchema
        requestHeaderSchema: RequestHeaderSchema
        isNonJSONResponseExpected: IsNonJSONResponseExpected
        isEmptyResponseExpected: IsEmptyResponseExpected
      }
    : never

export * from './contractService.js'
export * from './headers/createHeaderBuilderMiddleware.js'
export * from './headers/headerBuilder.js'
