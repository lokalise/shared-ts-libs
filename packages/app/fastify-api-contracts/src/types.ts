import type http from 'node:http'
import type { CommonRouteDefinition } from '@lokalise/api-contracts'
import type { FastifyReply, FastifyRequest, FastifySchema, RouteOptions } from 'fastify'
import type { z } from 'zod'

/**
 * Default fastify fields + fastify-swagger fields
 */
export type ExtendedFastifySchema = FastifySchema & {
  describe?: string
  description?: string
  summary?: string
}

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
