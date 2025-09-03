import type { ZodSchema, z } from 'zod/v4'
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
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
> = {
  isNonJSONResponseExpected?: IsNonJSONResponseExpected
  isEmptyResponseExpected?: IsEmptyResponseExpected
  successResponseBodySchema: ResponseBodySchema
  requestPathParamsSchema?: PathParamsSchema
  requestQuerySchema?: RequestQuerySchema
  requestHeaderSchema?: RequestHeaderSchema
  pathResolver: RoutePathResolver<InferSchemaOutput<PathParamsSchema>>
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
  IsNonJSONResponseExpected,
  IsEmptyResponseExpected,
  ResponseSchemasByStatusCode
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
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  params: PayloadRouteDefinition<
    RequestBodySchema,
    SuccessResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
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
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  params: Omit<
    GetRouteDefinition<
      SuccessResponseBodySchema,
      PathParamsSchema,
      RequestQuerySchema,
      RequestHeaderSchema,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected,
      ResponseSchemasByStatusCode
    >,
    'method'
  >,
): GetRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
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
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  params: Omit<
    DeleteRouteDefinition<
      SuccessResponseBodySchema,
      PathParamsSchema,
      RequestQuerySchema,
      RequestHeaderSchema,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected,
      ResponseSchemasByStatusCode
    >,
    'method'
  >,
): DeleteRouteDefinition<
  SuccessResponseBodySchema,
  PathParamsSchema,
  RequestQuerySchema,
  RequestHeaderSchema,
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

export function describeContract(
  contract: // biome-ignore lint/suspicious/noExplicitAny: we accept any contract here
    | PayloadRouteDefinition<any, any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: we accept any contract here
    | GetRouteDefinition<any, any, any, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: we accept any contract here
    | DeleteRouteDefinition<any, any, any, any, any, any, any>,
): string {
  return `${contract.method.toUpperCase()} ${mapRouteToPath(contract)}`
}
