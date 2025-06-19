import type { InferSchemaInput, InferSchemaOutput } from '@lokalise/api-contracts'
import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  PayloadRouteDefinition,
} from '@lokalise/api-contracts'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod/v4'

// biome-ignore lint/suspicious/noExplicitAny: we don't care about what kind of app instance we get here
type AnyFastifyInstance = FastifyInstance<any, any, any, any>

export type RouteRequestParams<
  PathParams = undefined,
  RequestQuery = never,
  RequestHeader = never,
> = {
  queryParams: RequestQuery extends never | undefined ? never : RequestQuery
  headers: RequestHeader extends never | undefined
    ? never
    : RequestHeader | (() => RequestHeader) | (() => Promise<RequestHeader>)
  pathParams: PathParams extends undefined ? never : PathParams
} extends infer Mandatory
  ? {
      [K in keyof Mandatory as Mandatory[K] extends never ? never : K]: Mandatory[K]
    }
  : never

export type PayloadRouteRequestParams<
  PathParams = undefined,
  RequestBody = undefined,
  RequestQuery = never,
  RequestHeader = never,
> = {
  body: RequestBody extends undefined ? never : RequestBody
  queryParams: RequestQuery extends never | undefined ? never : RequestQuery
  headers: RequestHeader extends never | undefined
    ? never
    : RequestHeader | (() => RequestHeader) | (() => Promise<RequestHeader>)
  pathParams: PathParams extends undefined ? never : PathParams
} extends infer Mandatory
  ? {
      [K in keyof Mandatory as Mandatory[K] extends never ? never : K]: Mandatory[K]
    }
  : never

export async function injectGet<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  app: AnyFastifyInstance,
  apiContract: GetRouteDefinition<
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  params: RouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
) {
  const resolvedHeaders =
    // @ts-expect-error fixme
    typeof params.headers === 'function' ? await params.headers() : params.headers

  return (
    app
      .inject()
      // @ts-expect-error fixme
      .get(apiContract.pathResolver(params.pathParams))
      .headers(resolvedHeaders)
      // @ts-expect-error fixme
      .query(params.queryParams)
      .end()
  )
}

export async function injectDelete<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
>(
  app: AnyFastifyInstance,
  apiContract: DeleteRouteDefinition<
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  params: RouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
) {
  const resolvedHeaders =
    // @ts-expect-error fixme
    typeof params.headers === 'function' ? await params.headers() : params.headers

  return (
    app
      .inject()
      // @ts-expect-error fixme
      .delete(apiContract.pathResolver(params.pathParams))
      .headers(resolvedHeaders)
      // @ts-expect-error fixme
      .query(params.queryParams)
      .end()
  )
}

export async function injectPost<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  RequestBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  app: AnyFastifyInstance,
  apiContract: PayloadRouteDefinition<
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  params: PayloadRouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaInput<RequestBodySchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
) {
  const resolvedHeaders =
    // @ts-expect-error fixme
    typeof params.headers === 'function' ? await params.headers() : params.headers

  return (
    app
      .inject()
      // @ts-expect-error fixme
      .post(apiContract.pathResolver(params.pathParams))
      // @ts-expect-error fixme
      .body(params.body)
      .headers(resolvedHeaders)
      // @ts-expect-error fixme
      .query(params.queryParams)
      .end()
  )
}

export async function injectPut<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  RequestBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  app: AnyFastifyInstance,
  apiContract: PayloadRouteDefinition<
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  params: PayloadRouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaInput<RequestBodySchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
) {
  const resolvedHeaders =
    // @ts-expect-error fixme
    typeof params.headers === 'function' ? await params.headers() : params.headers

  return (
    app
      .inject()
      // @ts-expect-error fixme
      .put(apiContract.pathResolver(params.pathParams))
      // @ts-expect-error fixme
      .body(params.body)
      .headers(resolvedHeaders)
      // @ts-expect-error fixme
      .query(params.queryParams)
      .end()
  )
}

export async function injectPatch<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  RequestBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  app: AnyFastifyInstance,
  apiContract: PayloadRouteDefinition<
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  params: PayloadRouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaInput<RequestBodySchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
) {
  const resolvedHeaders =
    // @ts-expect-error fixme
    typeof params.headers === 'function' ? await params.headers() : params.headers

  return (
    app
      .inject()
      // @ts-expect-error fixme
      .patch(apiContract.pathResolver(params.pathParams))
      // @ts-expect-error fixme
      .body(params.body)
      .headers(resolvedHeaders)
      // @ts-expect-error fixme
      .query(params.queryParams)
      .end()
  )
}
