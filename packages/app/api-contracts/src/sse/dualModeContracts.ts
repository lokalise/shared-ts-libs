import type { z } from 'zod/v4'
import type { RoutePathResolver } from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'
import type { SSEMethod } from './sseContracts.ts'
import type { SSEEventSchemas } from './sseTypes.ts'

/**
 * Definition for a dual-mode route.
 * Use `successResponseBodySchema` for the non-streaming response schema.
 *
 * @template Method - HTTP method (GET, POST, PUT, PATCH)
 * @template Params - Path parameters schema
 * @template Query - Query string parameters schema
 * @template RequestHeaders - Request headers schema
 * @template Body - Request body schema (for POST/PUT/PATCH)
 * @template SyncResponse - Sync response schema (for Accept: application/json)
 * @template Events - SSE event schemas (for Accept: text/event-stream)
 * @template ResponseHeaders - Response headers schema (for sync mode)
 * @template ResponseSchemasByStatusCode - Alternative response schemas by HTTP status code
 */
export type DualModeContractDefinition<
  Method extends SSEMethod = SSEMethod,
  Params extends z.ZodTypeAny = z.ZodTypeAny,
  Query extends z.ZodTypeAny = z.ZodTypeAny,
  RequestHeaders extends z.ZodTypeAny = z.ZodTypeAny,
  Body extends z.ZodTypeAny | undefined = undefined,
  SyncResponse extends z.ZodTypeAny = z.ZodTypeAny,
  Events extends SSEEventSchemas = SSEEventSchemas,
  ResponseHeaders extends z.ZodTypeAny | undefined = undefined,
  ResponseSchemasByStatusCode extends
    | Partial<Record<HttpStatusCode, z.ZodTypeAny>>
    | undefined = undefined,
> = {
  method: Method
  pathResolver: RoutePathResolver<z.infer<Params>>
  requestPathParamsSchema: Params
  requestQuerySchema: Query
  requestHeaderSchema: RequestHeaders
  requestBodySchema: Body
  /** Sync response schema - use with `sync` handler */
  successResponseBodySchema: SyncResponse
  responseHeaderSchema?: ResponseHeaders
  /**
   * Alternative response schemas by HTTP status code.
   * Used to define different response shapes for error cases (e.g., 400, 404, 500).
   *
   * @example
   * ```ts
   * responseBodySchemasByStatusCode: {
   *   400: z.object({ error: z.string(), details: z.array(z.string()) }),
   *   404: z.object({ error: z.string() }),
   * }
   * ```
   */
  responseBodySchemasByStatusCode?: ResponseSchemasByStatusCode
  serverSentEvents: Events
  isDualMode: true
}

/**
 * Type representing any dual-mode route definition (for use in generic constraints).
 * Uses a manually defined type to avoid pathResolver type incompatibilities.
 */
export type AnyDualModeContractDefinition = {
  method: SSEMethod
  // biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with all param types
  pathResolver: RoutePathResolver<any>
  requestPathParamsSchema: z.ZodTypeAny
  requestQuerySchema: z.ZodTypeAny
  requestHeaderSchema: z.ZodTypeAny
  requestBodySchema: z.ZodTypeAny | undefined
  /** Sync response schema - use with `sync` handler */
  successResponseBodySchema: z.ZodTypeAny
  responseHeaderSchema?: z.ZodTypeAny
  responseBodySchemasByStatusCode?: Partial<Record<HttpStatusCode, z.ZodTypeAny>>
  serverSentEvents: SSEEventSchemas
  isDualMode: true
}
