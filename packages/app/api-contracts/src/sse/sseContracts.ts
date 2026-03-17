import type { z } from 'zod/v4'
import type { CommonRouteDefinitionMetadata, RoutePathResolver } from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'
import type { SSEEventSchemas } from './sseTypes.ts'

/**
 * Supported HTTP methods for SSE routes.
 * While traditional SSE uses GET, modern APIs (e.g., OpenAI) use POST
 * to send request parameters in the body while streaming responses.
 */
export type SSEMethod = 'get' | 'post' | 'put' | 'patch'

/**
 * Definition for an SSE route with type-safe contracts.
 *
 * @template Method - HTTP method (GET, POST, PUT, PATCH)
 * @template Params - Path parameters schema
 * @template Query - Query string parameters schema
 * @template RequestHeaders - Request headers schema
 * @template Body - Request body schema (for POST/PUT/PATCH)
 * @template Events - Map of event name to event data schema
 * @template ResponseSchemasByStatusCode - Error response schemas by HTTP status code
 */
export type SSEContractDefinition<
  Method extends SSEMethod = SSEMethod,
  Params extends z.ZodTypeAny | undefined = undefined,
  Query extends z.ZodTypeAny | undefined = undefined,
  RequestHeaders extends z.ZodTypeAny | undefined = undefined,
  Body extends z.ZodTypeAny | undefined = undefined,
  Events extends SSEEventSchemas = SSEEventSchemas,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
> = {
  method: Method
  /**
   * Type-safe path resolver function.
   * Receives typed params and returns the URL path string.
   */
  pathResolver: Params extends z.ZodTypeAny ? RoutePathResolver<z.infer<Params>> : () => string
  requestPathParamsSchema?: Params
  requestQuerySchema?: Query
  requestHeaderSchema?: RequestHeaders
  requestBodySchema: Body
  serverSentEventSchemas: Events
  /**
   * Error response schemas by HTTP status code.
   * Used to define response shapes for errors that occur before streaming starts
   * (e.g., authentication failures, validation errors, not found).
   *
   * @example
   * ```ts
   * responseBodySchemasByStatusCode: {
   *   401: z.object({ error: z.literal('Unauthorized') }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseBodySchemasByStatusCode?: ResponseSchemasByStatusCode
  isSSE: true
  metadata?: CommonRouteDefinitionMetadata
  description?: string
  summary?: string
  tags?: readonly string[]
}

/**
 * Type representing any SSE route definition (for use in generic constraints).
 * Uses a manually defined type to avoid pathResolver type incompatibilities.
 */
export type AnySSEContractDefinition = {
  method: SSEMethod
  // biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with all param types
  pathResolver: RoutePathResolver<any>
  requestPathParamsSchema?: z.ZodTypeAny
  requestQuerySchema?: z.ZodTypeAny
  requestHeaderSchema?: z.ZodTypeAny
  requestBodySchema: z.ZodTypeAny | undefined
  serverSentEventSchemas: SSEEventSchemas
  responseBodySchemasByStatusCode?: Partial<Record<HttpStatusCode, z.ZodTypeAny>>
  isSSE: true
  metadata?: CommonRouteDefinitionMetadata
  description?: string
  summary?: string
  tags?: readonly string[]
}
