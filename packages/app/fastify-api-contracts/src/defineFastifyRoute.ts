import {
  type InferNonSseSuccessResponses,
  mapRouteContractToPath,
  type RouteContract,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteOptions,
} from 'fastify'
import type { z } from 'zod/v4'
import type { InferredOptionalSchema } from './responseTypes.ts'
import type { ExtendedFastifySchema, FastifyHandlerMethod, RouteType } from './types.ts'

type ExtractRequestBody<T> = T extends { requestBodySchema: z.ZodType }
  ? T['requestBodySchema']
  : undefined

type RouteReply<T extends RouteContract> = InferNonSseSuccessResponses<
  T['responseSchemasByStatusCode']
>
type RouteBody<T extends RouteContract> = InferredOptionalSchema<ExtractRequestBody<T>>
type RouteParams<T extends RouteContract> = InferredOptionalSchema<T['requestPathParamsSchema']>
type RouteQuery<T extends RouteContract> = InferredOptionalSchema<T['requestQuerySchema']>
type RouteHeaders<T extends RouteContract> = InferredOptionalSchema<T['requestHeaderSchema']>

/**
 * Returns the handler typed against the route contract.
 * Use when you need only the handler function (e.g. to separate route registration from handler logic).
 */
export const defineFastifyRouteHandler = <T extends RouteContract>(
  _routeContract: T,
  handler: FastifyHandlerMethod<
    RouteReply<T>,
    RouteBody<T>,
    RouteParams<T>,
    RouteQuery<T>,
    RouteHeaders<T>
  >,
): typeof handler => handler

type AllowedRouteOptions = Pick<
  RouteOptions<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    RouteGenericInterface,
    // biome-ignore lint/suspicious/noExplicitAny: Needed to be compatible with other libs
    any
  >,
  | 'config'
  | 'bodyLimit'
  | 'preParsing'
  | 'preSerialization'
  | 'preHandler'
  | 'preValidation'
  | 'onRequest'
  | 'onSend'
  | 'onError'
  | 'onResponse'
  | 'onTimeout'
  | 'onRequestAbort'
>

/**
 * Returns a complete Fastify route definition (method, url, schema, handler) from a route contract.
 */
export const defineFastifyRoute = <T extends RouteContract>(
  routeContract: T,
  handler: FastifyHandlerMethod<
    RouteReply<T>,
    RouteBody<T>,
    RouteParams<T>,
    RouteQuery<T>,
    RouteHeaders<T>
  >,
  contractMetadataToRouteMapper: (metadata: T['metadata']) => AllowedRouteOptions = () => ({}),
): RouteType<RouteReply<T>, RouteBody<T>, RouteParams<T>, RouteQuery<T>, RouteHeaders<T>> => {
  const routeMetadata = contractMetadataToRouteMapper(routeContract.metadata)

  const mergedConfig = routeMetadata.config
    ? { ...routeMetadata.config, apiContract: routeContract }
    : { apiContract: routeContract }

  const requestBodySchema =
    routeContract.method === 'post' ||
    routeContract.method === 'put' ||
    routeContract.method === 'patch'
      ? routeContract.requestBodySchema
      : undefined

  return {
    ...routeMetadata,
    config: mergedConfig,
    method: routeContract.method,
    url: mapRouteContractToPath(routeContract),
    handler,
    schema: copyWithoutUndefined({
      body: requestBodySchema,
      params: routeContract.requestPathParamsSchema,
      querystring: routeContract.requestQuerySchema,
      headers: routeContract.requestHeaderSchema,
      description: routeContract.description,
      summary: routeContract.summary,
      response: routeContract.responseSchemasByStatusCode,
    } satisfies ExtendedFastifySchema),
  } as unknown as RouteType<
    RouteReply<T>,
    RouteBody<T>,
    RouteParams<T>,
    RouteQuery<T>,
    RouteHeaders<T>
  >
}
