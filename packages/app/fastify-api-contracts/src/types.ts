import type { ApiContract } from '@lokalise/api-contracts'
import type {
  FastifySchema,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteOptions,
} from 'fastify'

/**
 * Default fastify fields + fastify-swagger fields
 */
export type ExtendedFastifySchema = FastifySchema & {
  description?: string
  summary?: string
  tags?: readonly string[]
  /** When true, the route will not be added to the OpenAPI docs */
  hide?: boolean
}

/**
 * Callback method to transform api contract metadata into fastify route options
 */
export type ApiContractMetadataToRouteMapper = (metadata: ApiContract['metadata']) => Pick<
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
