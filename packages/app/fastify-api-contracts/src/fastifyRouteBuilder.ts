import type { HttpStatusCode } from '@lokalise/api-contracts'
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

/**
 * Infers handler request type automatically from the contract.
 * Unified builder that replaces both `buildFastifyNoPayloadRouteHandler`
 * and `buildFastifyPayloadRouteHandler`.
 *
 * The handler type is automatically determined based on the contract:
 * - GET/DELETE contracts → handler without request body
 * - POST/PUT/PATCH contracts → handler with request body
 */

// Overload 1: GET route
export function buildFastifyRouteHandler<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
  ResponseHeaderSchema extends OptionalZodSchema = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  apiContract: GetRouteDefinition<
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
): typeof handler

// Overload 2: DELETE route
export function buildFastifyRouteHandler<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
  ResponseHeaderSchema extends OptionalZodSchema = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  apiContract: DeleteRouteDefinition<
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
): typeof handler

// Overload 3: Payload route (POST/PUT/PATCH)
export function buildFastifyRouteHandler<
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
): typeof handler

// Implementation
export function buildFastifyRouteHandler(
  // biome-ignore lint/suspicious/noExplicitAny: Union of all contract types
  _apiContract: any,
  // biome-ignore lint/suspicious/noExplicitAny: Handler type depends on overload
  handler: any,
  // biome-ignore lint/suspicious/noExplicitAny: Return type depends on overload
): any {
  return handler
}

/**
 * Builds a complete Fastify route definition from an API contract.
 * Unified builder that replaces both `buildFastifyNoPayloadRoute`
 * and `buildFastifyPayloadRoute`.
 *
 * The route type is automatically determined based on the contract:
 * - GET/DELETE contracts → route without request body in schema
 * - POST/PUT/PATCH contracts → route with request body in schema
 */

// Overload 1: GET route
export function buildFastifyRoute<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
  ResponseHeaderSchema extends OptionalZodSchema = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  apiContract: GetRouteDefinition<
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
  contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper,
): RouteType<
  BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
  undefined,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
>

// Overload 2: DELETE route
export function buildFastifyRoute<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
  ResponseHeaderSchema extends OptionalZodSchema = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  apiContract: DeleteRouteDefinition<
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
  contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper,
): RouteType<
  BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
  undefined,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
>

// Overload 3: Payload route (POST/PUT/PATCH)
export function buildFastifyRoute<
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
  contractMetadataToRouteMapper?: ApiContractMetadataToRouteMapper,
): RouteType<
  BuildResponseType<ResponseBodySchema, ResponseSchemasByStatusCode>,
  InferredOptionalSchema<RequestBodySchema>,
  InferredOptionalSchema<PathParams>,
  InferredOptionalSchema<RequestQuerySchema>,
  InferredOptionalSchema<RequestHeaderSchema>
>

// Implementation
export function buildFastifyRoute(
  // biome-ignore lint/suspicious/noExplicitAny: Union of all contract types
  apiContract: any,
  // biome-ignore lint/suspicious/noExplicitAny: Handler type depends on overload
  handler: any,
  contractMetadataToRouteMapper: ApiContractMetadataToRouteMapper = () => ({}),
  // biome-ignore lint/suspicious/noExplicitAny: Return type depends on overload
): any {
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
