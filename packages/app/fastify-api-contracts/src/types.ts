import type { CommonRouteDefinition } from '@lokalise/api-contracts'
import type {
  FastifySchema,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
  RouteOptions,
} from 'fastify'
import type { z } from 'zod'

interface FastifyContractRouteInterface<ReplyType, BodyType, ParamsType, QueryType, HeadersType>
  extends RouteGenericInterface {
  Body: BodyType
  Headers: HeadersType
  Params: ParamsType
  Querystring: QueryType
  Reply: ReplyType
}

/**
 * Default fastify fields + fastify-swagger fields
 */
export type ExtendedFastifySchema = FastifySchema & {
  describe?: string
  description?: string
  summary?: string
}

export type RouteType<
  // biome-ignore lint/suspicious/noExplicitAny: It's ok
  ReplyType = any,
  // biome-ignore lint/suspicious/noExplicitAny: It's ok
  BodyType = any,
  // biome-ignore lint/suspicious/noExplicitAny: It's ok
  ParamsType = any,
  // biome-ignore lint/suspicious/noExplicitAny: It's ok
  QueryType = any,
  // biome-ignore lint/suspicious/noExplicitAny: It's ok
  HeadersType = any,
> = RouteOptions<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyContractRouteInterface<ReplyType, BodyType, ParamsType, QueryType, HeadersType>,
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
export type FastifyPayloadHandlerFn<ReplyType, BodyType, ParamsType, QueryType, HeadersType> =
  RouteHandlerMethod<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    FastifyContractRouteInterface<ReplyType, BodyType, ParamsType, QueryType, HeadersType>
  >

/**
 * Handler for GET and DELETE methods
 */
export type FastifyNoPayloadHandlerFn<ReplyType, ParamsType, QueryType, HeadersType> =
  RouteHandlerMethod<
    RawServerDefault,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    FastifyContractRouteInterface<ReplyType, undefined, ParamsType, QueryType, HeadersType>
  >

/**
 * Callback method to transform api contract in to fastify route
 */
export type ApiContractMetadataToRouteMapper = <
  ApiContract extends CommonRouteDefinition<
    unknown,
    z.Schema | undefined,
    z.Schema | undefined,
    z.Schema | undefined,
    z.Schema | undefined,
    boolean,
    boolean
  >,
>(
  metadata: ApiContract['metadata'],
) => Pick<
  RouteType,
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
