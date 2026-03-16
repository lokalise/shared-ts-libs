import { z } from 'zod/v4'
import type { InferSchemaOutput, RoutePathResolver } from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'

export const ContractNoBody = Symbol.for('ContractNoBody');
export type ContractNoBodyType = typeof ContractNoBody;

export const ContractNonJsonResponse = Symbol.for('ContractNonJsonResponse');
export type ContractNonJsonResponseType = typeof ContractNonJsonResponse;

export type RouteContractResponse = ContractNoBodyType | ContractNonJsonResponseType | z.Schema

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
    requestBodySchema: z.Schema| ContractNoBodyType
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

const SUCCESSFUL_STATUS_CODES = [200, 201, 202, 203, 204, 205, 206, 207, 208, 226] as const

export const getSuccessResponseSchema = (routeConfig: RouteContract<any>): z.Schema | null => {
  const { responseSchemasByStatusCode } = routeConfig
  if (!responseSchemasByStatusCode) {
      return null
  }

  const schemas: z.Schema[] = []

  for (const code of SUCCESSFUL_STATUS_CODES) {
    const value = responseSchemasByStatusCode[code]

      if (!value) {
          continue
      }

      if (typeof value === 'symbol') {
          schemas.push(z.never())
      } else {
          schemas.push(value)
      }
  }

  if (schemas.length === 0) {
      return null
  }
  if (schemas.length > 1) {
      return z.union(schemas)
  }
  return schemas.at(0) ?? null
}


export const getIsEmptyResponseExpected = (routeConfig: RouteContract<any>): boolean => {
    const { responseSchemasByStatusCode } = routeConfig
    if (!responseSchemasByStatusCode) {
        return true
    }

    let isEmptyResponseExpected = true

    for (const code of SUCCESSFUL_STATUS_CODES) {
        const value = responseSchemasByStatusCode[code]

        if (value && typeof value !== 'symbol') {
            isEmptyResponseExpected = false
            break
        }
    }

    return isEmptyResponseExpected
}