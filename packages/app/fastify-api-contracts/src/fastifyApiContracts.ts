import type http from 'node:http'
import { copyWithoutUndefined } from '@lokalise/node-core'
import { type GetRouteDefinition, mapRouteToPath } from '@lokalise/universal-ts-utils/node'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { ZodSchema } from 'zod'

export type RouteType = RouteOptions<
  http.Server,
  http.IncomingMessage,
  http.ServerResponse,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any,
  // biome-ignore lint/suspicious/noExplicitAny: it's ok
  any
>

export type FastifyControllerFn<ReplyType, BodyType, ParamsType, QueryType, HeadersType> = (
  req: FastifyRequest<{
    Body: BodyType
    Headers: HeadersType
    Params: ParamsType
    Querystring: QueryType
    Reply: ReplyType
  }>,
  reply: FastifyReply,
) => Promise<void>

export type FastifyGetControllerFn<ReplyType, ParamsType, QueryType, HeadersType> = (
  req: FastifyRequest<{
    Body: never
    Headers: HeadersType
    Params: ParamsType
    Querystring: QueryType
    Reply: ReplyType
  }>,
  reply: FastifyReply<{ Body: ReplyType }>,
) => Promise<void>

export function buildGetController<
  ResponseBodySchema,
  PathParams,
  RequestQuerySchema,
  RequestHeaderSchema,
>(
  _apiContract: GetRouteDefinition<
    PathParams,
    ZodSchema<ResponseBodySchema>,
    ZodSchema<PathParams>,
    ZodSchema<RequestQuerySchema>,
    ZodSchema<RequestHeaderSchema>
  >,
  handler: FastifyGetControllerFn<
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema
  >,
): FastifyGetControllerFn<ResponseBodySchema, PathParams, RequestQuerySchema, RequestHeaderSchema> {
  return handler
}

export function buildFastifyGetRoute<
  ResponseBodySchema,
  PathParams,
  RequestQuerySchema,
  RequestHeaderSchema,
>(
  apiContract: GetRouteDefinition<
    PathParams,
    ZodSchema<ResponseBodySchema>,
    ZodSchema<PathParams>,
    ZodSchema<RequestQuerySchema>,
    ZodSchema<RequestHeaderSchema>
  >,
  handler: FastifyGetControllerFn<
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema
  >,
): RouteType {
  return {
    method: apiContract.method,
    url: mapRouteToPath(apiContract),
    handler,
    schema: copyWithoutUndefined({
      params: apiContract.requestPathParamsSchema,
      querystring: apiContract.requestQuerySchema,
      headers: apiContract.requestHeaderSchema,
      describe: apiContract.description,
    }),
  }
}
