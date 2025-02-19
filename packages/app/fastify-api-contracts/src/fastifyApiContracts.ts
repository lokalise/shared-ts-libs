import type http from 'node:http'
import { copyWithoutUndefined } from '@lokalise/node-core'
import {
  type DeleteRouteDefinition,
  type GetRouteDefinition,
  type PayloadRouteDefinition,
  mapRouteToPath,
} from '@lokalise/universal-ts-utils/node'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { FastifySchema } from 'fastify/types/schema'
import type { ZodSchema } from 'zod'

/**
 * Default fastify fields + fastify-swagger fields
 */
export type ExtendedFastifySchema = FastifySchema & { describe?: string }

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

/**
 * Handler for POST, PUT and PATCH methods
 */
export type FastifyPayloadHandlerFn<ReplyType, BodyType, ParamsType, QueryType, HeadersType> = (
  req: FastifyRequest<{
    Body: BodyType
    Headers: HeadersType
    Params: ParamsType
    Querystring: QueryType
    Reply: ReplyType
  }>,
  reply: FastifyReply,
) => Promise<void>

/**
 * Handler for GET and DELETE methods
 */
export type FastifyNoPayloadHandlerFn<ReplyType, ParamsType, QueryType, HeadersType> = (
  req: FastifyRequest<{
    Body: never
    Headers: HeadersType
    Params: ParamsType
    Querystring: QueryType
    Reply: ReplyType
  }>,
  reply: FastifyReply<{ Body: ReplyType }>,
) => Promise<void>

/**
 * Infers handler request type automatically from the contract for GET or DELETE methods
 */
export function buildFastifyNoPayloadRouteHandler<
  ResponseBodySchema,
  PathParams,
  RequestQuerySchema,
  RequestHeaderSchema,
>(
  _apiContract:
    | GetRouteDefinition<
        PathParams,
        ZodSchema<ResponseBodySchema>,
        ZodSchema<PathParams>,
        ZodSchema<RequestQuerySchema>,
        ZodSchema<RequestHeaderSchema>
      >
    | DeleteRouteDefinition<
        PathParams,
        ZodSchema<ResponseBodySchema>,
        ZodSchema<PathParams>,
        ZodSchema<RequestQuerySchema>,
        ZodSchema<RequestHeaderSchema>
      >,
  handler: FastifyNoPayloadHandlerFn<
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema
  >,
): FastifyNoPayloadHandlerFn<
  ResponseBodySchema,
  PathParams,
  RequestQuerySchema,
  RequestHeaderSchema
> {
  return handler
}

/**
 * Build full fastify route definition for GET or DELETE methods
 */
export function buildFastifyNoPayloadRoute<
  ResponseBodySchema,
  PathParams,
  RequestQuerySchema,
  RequestHeaderSchema,
>(
  apiContract:
    | GetRouteDefinition<
        PathParams,
        ZodSchema<ResponseBodySchema>,
        ZodSchema<PathParams>,
        ZodSchema<RequestQuerySchema>,
        ZodSchema<RequestHeaderSchema>,
        boolean,
        boolean
      >
    | DeleteRouteDefinition<
        PathParams,
        ZodSchema<ResponseBodySchema>,
        ZodSchema<PathParams>,
        ZodSchema<RequestQuerySchema>,
        ZodSchema<RequestHeaderSchema>,
        boolean,
        boolean
      >,
  handler: FastifyNoPayloadHandlerFn<
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
      response: apiContract.responseSchemasByStatusCode,
    } satisfies ExtendedFastifySchema),
  }
}

/**
 * Infers handler request type automatically from the contract for POST, PUT and PATCH methods
 */
export function buildFastifyPayloadRouteHandler<
  RequestBodySchema,
  ResponseBodySchema,
  PathParams,
  RequestQuerySchema,
  RequestHeaderSchema,
>(
  _apiContract: PayloadRouteDefinition<
    PathParams,
    ZodSchema<RequestBodySchema>,
    ZodSchema<ResponseBodySchema>,
    ZodSchema<PathParams>,
    ZodSchema<RequestQuerySchema>,
    ZodSchema<RequestHeaderSchema>
  >,
  handler: FastifyPayloadHandlerFn<
    ResponseBodySchema,
    RequestBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema
  >,
): FastifyPayloadHandlerFn<
  ResponseBodySchema,
  RequestBodySchema,
  PathParams,
  RequestQuerySchema,
  RequestHeaderSchema
> {
  return handler
}

/**
 * Build full fastify route definition for POST, PUT and PATCH methods
 */
export function buildFastifyPayloadRoute<
  RequestBodySchema,
  ResponseBodySchema,
  PathParams,
  RequestQuerySchema,
  RequestHeaderSchema,
>(
  apiContract: PayloadRouteDefinition<
    PathParams,
    ZodSchema<RequestBodySchema>,
    ZodSchema<ResponseBodySchema>,
    ZodSchema<PathParams>,
    ZodSchema<RequestQuerySchema>,
    ZodSchema<RequestHeaderSchema>
  >,
  handler: FastifyPayloadHandlerFn<
    ResponseBodySchema,
    RequestBodySchema,
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
      body: apiContract.requestBodySchema,
      params: apiContract.requestPathParamsSchema,
      querystring: apiContract.requestQuerySchema,
      headers: apiContract.requestHeaderSchema,
      describe: apiContract.description,
      response: apiContract.responseSchemasByStatusCode,
    } satisfies ExtendedFastifySchema),
  }
}
