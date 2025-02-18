import type { ZodSchema, z } from 'zod'

const EMPTY_PARAMS = {}

export type RoutePathResolver<PathParams> = (pathParams: PathParams) => string

export type InferSchemaOutput<T extends ZodSchema | undefined> = T extends ZodSchema<infer U>
  ? U
  : T extends undefined
    ? undefined
    : never

export type CommonRouteDefinition<
  PathParams,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema<PathParams> | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
> = {
  isNonJSONResponseExpected?: IsNonJSONResponseExpected
  isEmptyResponseExpected?: IsEmptyResponseExpected
  responseBodySchema: ResponseBodySchema
  requestPathParamsSchema?: PathParamsSchema
  requestQuerySchema?: RequestQuerySchema
  requestHeaderSchema?: RequestHeaderSchema
  pathResolver: RoutePathResolver<InferSchemaOutput<PathParamsSchema>>
  description?: string
}

export type PayloadRouteDefinition<
  PathParams,
  RequestBodySchema extends z.Schema | undefined = undefined,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema<PathParams> | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
> = CommonRouteDefinition<
  PathParams,
  ResponseBodySchema,
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
  PathParams,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema<PathParams> | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
> = CommonRouteDefinition<
  PathParams,
  ResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected
> & {
  method: 'get'
}

export type DeleteRouteDefinition<
  PathParams,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema<PathParams> | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
> = CommonRouteDefinition<
  PathParams,
  ResponseBodySchema,
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
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  PathParams = PathParamsSchema extends z.Schema<infer T> ? T : never,
>(
  params: PayloadRouteDefinition<
    PathParams,
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
): PayloadRouteDefinition<
  PathParams,
  RequestBodySchema,
  ResponseBodySchema,
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
    responseBodySchema: params.responseBodySchema,
    description: params.description,
  }
}

export function buildGetRoute<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  PathParams = PathParamsSchema extends z.Schema<infer T> ? T : never,
>(
  params: Omit<
    GetRouteDefinition<
      PathParams,
      ResponseBodySchema,
      PathParamsSchema,
      RequestQuerySchema,
      RequestHeaderSchema,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected
    >,
    'method'
  >,
): GetRouteDefinition<
  PathParams,
  ResponseBodySchema,
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
    responseBodySchema: params.responseBodySchema,
    description: params.description,
  }
}

export function buildDeleteRoute<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  PathParams = PathParamsSchema extends z.Schema<infer T> ? T : never,
>(
  params: Omit<
    DeleteRouteDefinition<
      PathParams,
      ResponseBodySchema,
      PathParamsSchema,
      RequestQuerySchema,
      RequestHeaderSchema,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected
    >,
    'method'
  >,
): DeleteRouteDefinition<
  PathParams,
  ResponseBodySchema,
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
    responseBodySchema: params.responseBodySchema,
    description: params.description,
  }
}

/**
 * This method maps given route definition to a string of the format '/static-path-part/:path-param-value'
 */
export function mapRouteToPath(
  // biome-ignore lint/suspicious/noExplicitAny: We don't care about types here, we just need Zod schema
  routeDefinition: CommonRouteDefinition<any, any, any, any, any, any, any>,
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
