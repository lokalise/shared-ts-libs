import type {
  DeleteRouteDefinition,
  GetRouteDefinition,
  HttpStatusCode,
  InferSchemaInput,
  InferSchemaOutput,
  PayloadRouteDefinition,
} from '@lokalise/api-contracts'
import type { Response as LightMyRequestResponse } from 'light-my-request'
import type { z } from 'zod/v4'

import type { PayloadRouteRequestParams, RouteRequestParams } from './fastifyApiRequestInjector.ts'
import { type AnyFastifyInstance, dispatchInjectByMethod } from './injectRequestDispatcher.ts'

/**
 * Unified request injector that automatically determines the HTTP method from the contract.
 * Replaces `injectGet`, `injectDelete`, `injectPost`, `injectPut`, and `injectPatch`.
 *
 * The params type is automatically resolved based on the contract:
 * - GET/DELETE contracts → params without request body
 * - POST/PUT/PATCH contracts → params with request body
 */

// Overload 1: GET route
export async function injectByContract<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  app: AnyFastifyInstance,
  apiContract: GetRouteDefinition<
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
  params: RouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
): Promise<LightMyRequestResponse>

// Overload 2: DELETE route
export async function injectByContract<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = true,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  app: AnyFastifyInstance,
  apiContract: DeleteRouteDefinition<
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
  params: RouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
): Promise<LightMyRequestResponse>

// Overload 3: Payload route (POST/PUT/PATCH)
export async function injectByContract<
  ResponseBodySchema extends z.Schema | undefined = undefined,
  RequestBodySchema extends z.Schema | undefined = undefined,
  PathParamsSchema extends z.Schema | undefined = undefined,
  RequestQuerySchema extends z.Schema | undefined = undefined,
  RequestHeaderSchema extends z.Schema | undefined = undefined,
  ResponseHeaderSchema extends z.Schema | undefined = undefined,
  IsNonJSONResponseExpected extends boolean = false,
  IsEmptyResponseExpected extends boolean = false,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.Schema>>
    | undefined = undefined,
>(
  app: AnyFastifyInstance,
  apiContract: PayloadRouteDefinition<
    RequestBodySchema,
    ResponseBodySchema,
    PathParamsSchema,
    RequestQuerySchema,
    RequestHeaderSchema,
    ResponseHeaderSchema,
    IsNonJSONResponseExpected,
    IsEmptyResponseExpected,
    ResponseSchemasByStatusCode
  >,
  params: PayloadRouteRequestParams<
    InferSchemaOutput<PathParamsSchema>,
    InferSchemaInput<RequestBodySchema>,
    InferSchemaInput<RequestQuerySchema>,
    InferSchemaInput<RequestHeaderSchema>
  >,
): Promise<LightMyRequestResponse>

// Implementation
export function injectByContract(
  app: AnyFastifyInstance,
  // biome-ignore lint/suspicious/noExplicitAny: Union of all contract types
  apiContract: any,
  // biome-ignore lint/suspicious/noExplicitAny: Params type depends on overload
  params: any,
): Promise<LightMyRequestResponse> {
  const path = apiContract.pathResolver(params.pathParams)

  return dispatchInjectByMethod(app, apiContract.method, path, params)
}
