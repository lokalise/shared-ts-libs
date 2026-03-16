import type { z } from 'zod/v4'
import type { InferSchemaOutput, RoutePathResolver } from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'

export const ContractNoBody = Symbol.for('ContractNoBody');
export type ContractNoBodyType = typeof ContractNoBody;

export type RouteContractResponse = ContractNoBodyType | z.Schema

export type ResponseSchemasByStatusCode = Partial<
    Record<HttpStatusCode, RouteContractResponse>
>;

type CommonRouteContract<PathParamsSchema extends z.Schema | undefined> = {
  pathResolver: RoutePathResolver<InferSchemaOutput<PathParamsSchema>>
  requestPathParamsSchema?: z.Schema
  requestQuerySchema?: z.Schema
  requestHeaderSchema?: z.Schema
  responseHeaderSchema?: z.Schema
  responseSchemasByStatusCode?: ResponseSchemasByStatusCode

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
export type GetRouteContract<PathParamsSchema extends z.Schema | undefined> =
  CommonRouteContract<PathParamsSchema> & {
    method: 'get'
    requestBodySchema?: never
  }

/**
 * Configuration for building a DELETE route.
 */
export type DeleteRouteContract<PathParamsSchema extends z.Schema | undefined> =
  CommonRouteContract<PathParamsSchema> & {
    method: 'delete'
    requestBodySchema?: never
  }

/**
 * Configuration for building a payload route (POST, PUT, PATCH).
 */
export type PayloadRouteContract<PathParamsSchema extends z.Schema | undefined> =
  CommonRouteContract<PathParamsSchema> & {
    method: 'post' | 'put' | 'patch'
    requestBodySchema: z.Schema
  }

export type RouteContract<PathParamsSchema extends z.Schema | undefined> =
  | GetRouteContract<PathParamsSchema>
  | DeleteRouteContract<PathParamsSchema>
  | PayloadRouteContract<PathParamsSchema>

/** * Helper to prevent extra keys.
 * If T has keys not in U, it forces an error.
 */
type Exactly<T, U> = T & {
  [K in keyof T]: K extends keyof U ? T[K] : never
}

export const defineRouteContract = <
  PathParamsSchema extends z.Schema | undefined,
  const Contract extends RouteContract<PathParamsSchema>,
>(
  route: Exactly<Contract, RouteContract<PathParamsSchema>> & {
    requestPathParamsSchema?: PathParamsSchema
  },
): Contract => route

export const mapRouteContractToPath = (routeConfig: RouteContract<any>): string => {
  if (!routeConfig.requestPathParamsSchema) {
    return routeConfig.pathResolver(undefined)
  }

  // biome-ignore lint/suspicious/noExplicitAny: cannot infer zod object with typed shape here
  const shape = (routeConfig.requestPathParamsSchema as any).shape
  const resolverParams: Record<string, string> = {}
  for (const key of Object.keys(shape)) {
    resolverParams[key] = `:${key}`
  }

  return routeConfig.pathResolver(resolverParams)
}

export const describeRouteContract = (routeConfig: RouteContract<any>): string => {
  return `${routeConfig.method.toUpperCase()} ${mapRouteContractToPath(routeConfig)}`
}
