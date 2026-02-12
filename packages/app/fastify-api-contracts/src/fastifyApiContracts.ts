import type { CommonRouteDefinition, HttpStatusCode } from '@lokalise/api-contracts'
import {
  type DeleteRouteDefinition,
  type GetRouteDefinition,
  mapRouteToPath,
  type PayloadRouteDefinition,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import type { z } from 'zod/v4'
import type {
  BuildResponseType,
  InferredOptionalSchema,
  OptionalZodSchema,
} from './responseTypes.ts'
import type {
  ApiContractMetadataToRouteMapper,
  ExtendedFastifySchema,
  FastifyNoPayloadHandlerFn,
  FastifyPayloadHandlerFn,
  RouteType,
} from './types.ts'

declare module 'fastify' {
  interface FastifyContextConfig {
    apiContract: CommonRouteDefinition
  }
}

/**
 * @deprecated Use `buildFastifyRouteHandler` instead. This function will be removed in a future version.
 *
 * Infers handler request type automatically from the contract for GET or DELETE methods
 */
export function buildFastifyNoPayloadRouteHandler<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
  ResponseHeaderSchema extends OptionalZodSchema = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  _apiContract:
    | GetRouteDefinition<
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema,
        ResponseHeaderSchema,
        boolean,
        boolean,
        ResponseSchemasByStatusCode
      >
    | DeleteRouteDefinition<
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema,
        ResponseHeaderSchema,
        boolean,
        boolean,
        ResponseSchemasByStatusCode
      >,
  handler: FastifyNoPayloadHandlerFn<
    BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
  >,
): typeof handler {
  return handler
}

/**
 * @deprecated Use `buildFastifyRoute` instead. This function will be removed in a future version.
 *
 * Build full fastify route definition for GET or DELETE methods
 */
export function buildFastifyNoPayloadRoute<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
  ResponseHeaderSchema extends OptionalZodSchema = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  apiContract:
    | GetRouteDefinition<
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema,
        ResponseHeaderSchema,
        boolean,
        boolean,
        ResponseSchemasByStatusCode
      >
    | DeleteRouteDefinition<
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema,
        ResponseHeaderSchema,
        boolean,
        boolean,
        ResponseSchemasByStatusCode
      >,
  handler: FastifyNoPayloadHandlerFn<
    BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
  >,
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
): RouteType<
  BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
  undefined,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
> {
  const routeMetadata = contractMetadataToRouteMapper(apiContract.metadata)
  const mergedConfig = routeMetadata.config
    ? {
        ...routeMetadata.config,
        apiContract,
      }
    : {
        apiContract,
      }
  const mergedMetadata = {
    ...routeMetadata,
    config: mergedConfig,
  }

  return {
    ...mergedMetadata,
    method: apiContract.method,
    url: mapRouteToPath(apiContract),
    // Type assertion needed due to Fastify's RouteHandlerMethod having incompatible
    // conditional type branches (any vs never) for Reply type in different contexts
    handler: handler as RouteType<
      BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
      undefined,
      InferredOptionalSchema<PathParams>,
      InferredOptionalSchema<RequestQuerySchema>,
      InferredOptionalSchema<RequestHeaderSchema>
    >['handler'],
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
 * @deprecated Use `buildFastifyRouteHandler` instead. This function will be removed in a future version.
 *
 * Infers handler request type automatically from the contract for POST, PUT and PATCH methods
 */
export function buildFastifyPayloadRouteHandler<
  RequestBodySchema extends OptionalZodSchema = undefined,
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
  ResponseHeaderSchema extends OptionalZodSchema = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  _apiContract: PayloadRouteDefinition<
    RequestBodySchema,
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
  handler: FastifyPayloadHandlerFn<
    BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
    InferredOptionalSchema<RequestBodySchema>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
  >,
): typeof handler {
  return handler
}

/**
 * @deprecated Use `buildFastifyRoute` instead. This function will be removed in a future version.
 *
 * Build full fastify route definition for POST, PUT and PATCH methods
 */
export function buildFastifyPayloadRoute<
  RequestBodySchema extends OptionalZodSchema = undefined,
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
  ResponseHeaderSchema extends OptionalZodSchema = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  apiContract: PayloadRouteDefinition<
    RequestBodySchema,
    ResponseBodySchema,
    PathParams,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
  handler: FastifyPayloadHandlerFn<
    BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
    InferredOptionalSchema<RequestBodySchema>,
    InferredOptionalSchema<PathParams>,
    InferredOptionalSchema<RequestQuerySchema>,
    InferredOptionalSchema<RequestHeaderSchema>
  >,
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
): RouteType<
  BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
  InferredOptionalSchema<RequestBodySchema>,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
> {
  const routeMetadata = contractMetadataToRouteMapper(apiContract.metadata)
  const mergedConfig = routeMetadata.config
    ? {
        ...routeMetadata.config,
        apiContract,
      }
    : {
        apiContract,
      }
  const mergedMetadata = {
    ...routeMetadata,
    config: mergedConfig,
  }

  return {
    ...mergedMetadata,
    method: apiContract.method,
    url: mapRouteToPath(apiContract),
    // Type assertion needed due to Fastify's RouteHandlerMethod having incompatible
    // conditional type branches (any vs never) for Reply type in different contexts
    handler: handler as RouteType<
      BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
      InferredOptionalSchema<RequestBodySchema>,
      InferredOptionalSchema<PathParams>,
      InferredOptionalSchema<RequestQuerySchema>,
      InferredOptionalSchema<RequestHeaderSchema>
    >['handler'],
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
