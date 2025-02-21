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
import type { z } from 'zod'

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

type OptionalZodSchema = z.Schema | undefined
type InferredOptionalSchema<Schema> = Schema extends z.Schema ? z.infer<Schema> : never

/**
 * Infers handler request type automatically from the contract for GET or DELETE methods
 */
export function buildFastifyNoPayloadRouteHandler<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
>(
  _apiContract:
    | GetRouteDefinition<
        InferredOptionalSchema<PathParams>,
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema
      >
    | DeleteRouteDefinition<
        InferredOptionalSchema<PathParams>,
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema
      >,
  handler: FastifyNoPayloadHandlerFn<
    InferredOptionalSchema<ResponseBodySchema>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
  >,
): FastifyNoPayloadHandlerFn<
  InferredOptionalSchema<ResponseBodySchema>,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
> {
  return handler
}

/**
 * Build full fastify route definition for GET or DELETE methods
 */
export function buildFastifyNoPayloadRoute<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
>(
  apiContract:
    | GetRouteDefinition<
        InferredOptionalSchema<PathParams>,
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema,
        boolean,
        boolean
      >
    | DeleteRouteDefinition<
        InferredOptionalSchema<PathParams>,
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema,
        boolean,
        boolean
      >,
  handler: FastifyNoPayloadHandlerFn<
    InferredOptionalSchema<ResponseBodySchema>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
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
  RequestBodySchema extends OptionalZodSchema = undefined,
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
>(
  _apiContract: PayloadRouteDefinition<
    InferredOptionalSchema<PathParams>,
    RequestBodySchema,
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema
  >,
  handler: FastifyPayloadHandlerFn<
    InferredOptionalSchema<ResponseBodySchema>,
    InferredOptionalSchema<RequestBodySchema>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
  >,
): FastifyPayloadHandlerFn<
  InferredOptionalSchema<ResponseBodySchema>,
  InferredOptionalSchema<RequestBodySchema>,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
> {
  return handler
}

/**
 * Build full fastify route definition for POST, PUT and PATCH methods
 */
export function buildFastifyPayloadRoute<
  RequestBodySchema extends OptionalZodSchema = undefined,
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
>(
  apiContract: PayloadRouteDefinition<
    InferredOptionalSchema<PathParams>,
    RequestBodySchema,
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema
  >,
  handler: FastifyPayloadHandlerFn<
    InferredOptionalSchema<ResponseBodySchema>,
    InferredOptionalSchema<RequestBodySchema>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
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
