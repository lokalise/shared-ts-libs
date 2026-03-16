import { z } from 'zod/v4'
import type { InferSchemaOutput, RoutePathResolver } from '../apiContracts.ts'
import type { HttpStatusCode } from '../HttpStatusCodes.ts'

export const ContractNoBody = Symbol.for('ContractNoBody')
export type ContractNoBodyType = typeof ContractNoBody

export const ContractNonJsonResponse = Symbol.for('ContractNonJsonResponse')
export type ContractNonJsonResponseType = typeof ContractNonJsonResponse

export type RouteContractResponse = ContractNoBodyType | ContractNonJsonResponseType | z.Schema

export type ResponseSchemasByStatusCode = Partial<Record<HttpStatusCode, RouteContractResponse>>

export type CommonRouteContract = {
  // biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with generics
  pathResolver: RoutePathResolver<any>
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
 * Contract for building a GET route.
 */
export type GetRouteContract = CommonRouteContract & {
  method: 'get'
  requestBodySchema?: never
}

/**
 * Contract for building a DELETE route.
 */
export type DeleteRouteContract = CommonRouteContract & {
  method: 'delete'
  requestBodySchema?: never
}

/**
 * Contract for building a payload route (POST, PUT, PATCH).
 */
export type PayloadRouteContract = CommonRouteContract & {
  method: 'post' | 'put' | 'patch'
  requestBodySchema: ContractNoBodyType | z.Schema
}

export type RouteContract = GetRouteContract | DeleteRouteContract | PayloadRouteContract

/** * Helper to prevent extra keys.
 * If T has keys not in U, it forces an error.
 */
type Exactly<T, U> = T & {
  [K in keyof T]: K extends keyof U ? T[K] : never
}

type TypedPath<T extends z.Schema | undefined> = {
  requestPathParamsSchema?: T
  pathResolver: RoutePathResolver<InferSchemaOutput<T>>
}

export const defineRouteContract = <
  PathParamsSchema extends z.Schema | undefined,
  TypedPathContract extends Omit<RouteContract, 'pathResolver'> & TypedPath<PathParamsSchema>,
  const Contract extends TypedPathContract,
>(
  route: Exactly<Contract, TypedPathContract> & TypedPath<PathParamsSchema>,
): Contract => route

export const mapRouteContractToPath = (routeConfig: RouteContract): string => {
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

export const describeRouteContract = (routeConfig: RouteContract): string => {
  return `${routeConfig.method.toUpperCase()} ${mapRouteContractToPath(routeConfig)}`
}

const SUCCESSFUL_STATUS_CODES = [200, 201, 202, 203, 204, 205, 206, 207, 208, 226] as const

export const getSuccessResponseSchema = (routeConfig: RouteContract): z.Schema | null => {
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

export const getIsEmptyResponseExpected = (routeConfig: RouteContract): boolean => {
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
