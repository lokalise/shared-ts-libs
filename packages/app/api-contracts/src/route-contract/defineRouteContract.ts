import { z } from 'zod/v4'
import type { InferSchemaOutput, RoutePathResolver } from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'

type CommonRouteConfig<PathParamsSchema extends z.Schema | undefined> = {
    pathResolver: RoutePathResolver<InferSchemaOutput<PathParamsSchema>>
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
export type GetRouteConfig<PathParamsSchema extends z.Schema | undefined> =
    CommonRouteConfig<PathParamsSchema> & {
    method: 'get'
}

/**
 * Configuration for building a DELETE route.
 */
export type DeleteRouteConfig<PathParamsSchema extends z.Schema | undefined> =
    CommonRouteConfig<PathParamsSchema> & {
    method: 'delete'
}

/**
 * Configuration for building a payload route (POST, PUT, PATCH).
 */
export type PayloadRouteConfig<PathParamsSchema extends z.Schema | undefined> =
    CommonRouteConfig<PathParamsSchema> & {
    method: 'post' | 'put' | 'patch'
    requestBodySchema: z.Schema
}

type RouteConfig<PathParamsSchema extends z.Schema | undefined> =
    | GetRouteConfig<PathParamsSchema>
    | DeleteRouteConfig<PathParamsSchema>
    | PayloadRouteConfig<PathParamsSchema>

export const defineRouteContract = <
    PathParamsSchema extends z.Schema | undefined,
    const Contract extends RouteConfig<PathParamsSchema>
>(
    route: Contract & { requestPathParamsSchema?: PathParamsSchema },
): Contract => route
