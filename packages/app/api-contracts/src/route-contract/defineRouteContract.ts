import { z } from 'zod/v4'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'

type CommonRouteConfig = {
    path: `/${string}`
    requestPathParamsSchema?: z.Schema
    requestQuerySchema?: z.Schema
    requestHeaderSchema?: z.Schema
    responseHeaderSchema?: z.Schema
    responseSchemasByStatusCode?: Partial<Record<HttpStatusCode, z.Schema>>

    isNonJSONResponseExpected?: boolean
    isEmptyResponseExpected?: boolean

    metadata?: Record<string, unknown>
    summary?: string
    description?: string
    tags?: readonly string[]
}

/**
 * Configuration for building a GET route.
 */
export type GetRouteConfig = CommonRouteConfig & {
  method: 'get'
}

/**
 * Configuration for building a DELETE route.
 */
export type DeleteRouteConfig = CommonRouteConfig & {
  method: 'delete'
}

/**
 * Configuration for building a payload route (POST, PUT, PATCH).
 */
export type PayloadRouteConfig = CommonRouteConfig & {
  method: 'post' | 'put' | 'patch'
  requestBodySchema: z.Schema
}

const defineRouteContract = <
    const T extends GetRouteConfig | DeleteRouteConfig | PayloadRouteConfig
>(route: T): T => route

const myRoute = defineRouteContract({
    method: 'get',
    path: '/',
    requestPathParamsSchema: z.object({
       id: z.uuid(),
    }),
    responseSchemasByStatusCode: {
        200: z.object({
            name: z.string(),
        }),
    },
})
