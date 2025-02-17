import type { InferSchemaOutput } from '@lokalise/universal-ts-utils/api-contracts/apiContracts'
import type { GetRouteDefinition } from '@lokalise/universal-ts-utils/node'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'

export type RouteRequestParams<
  PathParams = undefined,
  RequestQuery = never,
  RequestHeader = never,
> = {
  queryParams: RequestQuery extends never | undefined ? never : RequestQuery
  headers: RequestHeader extends never | undefined ? never : RequestHeader
  pathParams: PathParams extends undefined ? never : PathParams
} extends infer Mandatory
  ? {
      [K in keyof Mandatory as Mandatory[K] extends never ? never : K]: Mandatory[K]
    }
  : never

export function injectGet<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
>(
  app: FastifyInstance,
  apiContract: GetRouteDefinition<
    InferSchemaOutput<PathParamsSchema>,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema
  >,
  params: RouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaOutput<RequestQuerySchema>,
    InferSchemaOutput<RequestHeaderSchema>
  >,
) {
  return (
    app
      .inject()
      // @ts-expect-error fixme
      .get(apiContract.pathResolver(params.pathParams))
      // @ts-expect-error fixme
      .headers(params.headers)
      // @ts-expect-error fixme
      .query(params.queryParams)
      .end()
  )
}
