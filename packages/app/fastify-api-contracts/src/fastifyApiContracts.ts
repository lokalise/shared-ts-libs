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
  ApiContractMetadataToRouteMapper,
  ExtendedFastifySchema,
  FastifyNoPayloadHandlerFn,
  FastifyPayloadHandlerFn,
  RouteType,
} from './types.ts'

type OptionalZodSchema = z.Schema | undefined
type InferredOptionalSchema<Schema> = Schema extends z.Schema ? z.infer<Schema> : undefined

// Helper to create a union of all response types from responseSchemasByStatusCode
// Filters out undefined values that come from Partial<Record<...>>
type InferResponseUnion<T> = T extends object
  ? {
      [K in keyof T as T[K] extends z.Schema ? K : never]: T[K] extends z.Schema
        ? z.infer<T[K]>
        : never
    }[keyof { [K in keyof T as T[K] extends z.Schema ? K : never]: T[K] }]
  : never

// Build response type - either a union of all schemas or just the success schema
// Note: This creates a union type of all possible responses, which means TypeScript
// will accept any of the response types regardless of the status code being set.
// This is a limitation compared to Fastify's native multi-reply system which can
// narrow types based on the status code. Full multi-reply support would require
// deeper integration with Fastify's SchemaCompiler generic system.
type BuildResponseType<SuccessSchema, ResponseSchemasByStatusCode> =
  ResponseSchemasByStatusCode extends object
    ? keyof ResponseSchemasByStatusCode extends never
      ? SuccessSchema extends z.Schema
        ? z.infer<SuccessSchema>
        : undefined
      :
          | InferResponseUnion<ResponseSchemasByStatusCode>
          | (SuccessSchema extends z.Schema
              ? 200 extends keyof ResponseSchemasByStatusCode
                ? never
                : z.infer<SuccessSchema>
              : never)
    : SuccessSchema extends z.Schema
      ? z.infer<SuccessSchema>
      : undefined

declare module 'fastify' {
  interface FastifyContextConfig {
    apiContract: CommonRouteDefinition
  }
}

/**
 * Infers handler request type automatically from the contract for GET or DELETE methods
 */
export function buildFastifyNoPayloadRouteHandler<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
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
        boolean,
        boolean,
        ResponseSchemasByStatusCode
      >
    | DeleteRouteDefinition<
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema,
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
 * Build full fastify route definition for GET or DELETE methods
 */
export function buildFastifyNoPayloadRoute<
  ResponseBodySchema extends OptionalZodSchema = undefined,
  PathParams extends OptionalZodSchema = undefined,
  RequestQuerySchema extends OptionalZodSchema = undefined,
  RequestHeaderSchema extends OptionalZodSchema = undefined,
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
        boolean,
        boolean,
        ResponseSchemasByStatusCode
      >
    | DeleteRouteDefinition<
        ResponseBodySchema,
        PathParams,
        RequestQuerySchema,
        RequestHeaderSchema,
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
