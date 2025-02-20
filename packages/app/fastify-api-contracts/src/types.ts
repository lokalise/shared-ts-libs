import type http from 'node:http'
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import type { FastifySchema } from 'fastify/types/schema'

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
