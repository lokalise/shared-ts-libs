import type { ZodSchema, z } from 'zod'

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
}

export type ChangeRouteDefinition<
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

export function buildChangeRoute<
  PathParams,
  RequestBodySchema extends z.Schema | undefined = undefined,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema<PathParams> | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  params: ChangeRouteDefinition<
    PathParams,
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
): ChangeRouteDefinition<
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
  }
}

export function buildGetRoute<
  PathParams,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema<PathParams> | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
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
  }
}

export function buildDeleteRoute<
  PathParams,
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema<PathParams> | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
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
  }
}
