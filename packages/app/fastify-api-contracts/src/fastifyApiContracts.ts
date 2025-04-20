import {
  type DeleteRouteDefinition,
  type GetRouteDefinition,
  type PayloadRouteDefinition,
  mapRouteToPath,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import type { z } from 'zod'
import type {
  ApiContractMetadataToRouteMapper,
  ExtendedFastifySchema,
  FastifyNoPayloadHandlerFn,
  FastifyPayloadHandlerFn,
  RouteType,
} from './types.js'

type OptionalZodSchema = z.Schema | undefined
type InferredOptionalSchema<Schema> = Schema extends z.Schema ? z.infer<Schema> : undefined

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
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
): RouteType<
  InferredOptionalSchema<ResponseBodySchema>,
  undefined,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
> {
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
      description: apiContract.description,
      summary: apiContract.summary,
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
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  _apiContract: PayloadRouteDefinition<
    InferredOptionalSchema<PathParams>,
    RequestBodySchema,
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
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
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
>(
  apiContract: PayloadRouteDefinition<
    InferredOptionalSchema<PathParams>,
    RequestBodySchema,
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected
  >,
  handler: FastifyPayloadHandlerFn<
    InferredOptionalSchema<ResponseBodySchema>,
    InferredOptionalSchema<RequestBodySchema>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
  >,
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
): RouteType<
  InferredOptionalSchema<ResponseBodySchema>,
  InferredOptionalSchema<RequestBodySchema>,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
> {
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
      description: apiContract.description,
      summary: apiContract.summary,
      response: apiContract.responseSchemasByStatusCode,
    } satisfies ExtendedFastifySchema),
  }
}
