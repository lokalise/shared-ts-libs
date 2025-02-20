import { copyWithoutUndefined } from '@lokalise/node-core'
import {
  type DeleteRouteDefinition,
  type GetRouteDefinition,
  type PayloadRouteDefinition,
  mapRouteToPath,
} from '@lokalise/universal-ts-utils/node'
import type { ZodSchema } from 'zod'
import type {
  ApiContractMetadataToRouteMapper,
  ExtendedFastifySchema,
  FastifyNoPayloadHandlerFn,
  FastifyPayloadHandlerFn,
  RouteType,
} from './types.js'

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
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
): RouteType {
  return {
    ...contractMetadataToRouteMapper(apiContract.metadata),
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
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
): RouteType {
  return {
    ...contractMetadataToRouteMapper(apiContract.metadata),
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
