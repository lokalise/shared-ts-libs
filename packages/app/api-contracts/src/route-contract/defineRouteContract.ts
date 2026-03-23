import { z } from 'zod/v4'
import type { InferSchemaOutput, RoutePathResolver } from '../apiContracts.ts'
import { type HttpStatusCode, SUCCESSFUL_HTTP_STATUS_CODES } from '../HttpStatusCodes.ts'

export const ContractNoBody = Symbol.for('ContractNoBody')
export type ContractNoBodyType = typeof ContractNoBody

export type TypedNonJsonResponse<T extends z.ZodType = z.ZodType> = {
  readonly _tag: 'NonJsonResponse'
  readonly contentType: string
  readonly schema: T
}

export const defineNonJsonResponse = <T extends z.ZodType>(options: {
  contentType: string
  schema: T
}): TypedNonJsonResponse<T> => ({
  _tag: 'NonJsonResponse',
  contentType: options.contentType,
  schema: options.schema,
})

export const isTypedNonJsonResponse = (
  value: RouteContractResponse,
): value is TypedNonJsonResponse =>
  typeof value === 'object' && value !== null && '_tag' in value && value._tag === 'NonJsonResponse'

export type RouteContractResponse = ContractNoBodyType | TypedNonJsonResponse | z.ZodType

export type ResponseSchemasByStatusCode = Partial<Record<HttpStatusCode, RouteContractResponse>>

export type RequestPathParamsSchema = z.ZodObject

export type CommonRouteContract = {
  // biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with generics
  pathResolver: RoutePathResolver<any>
  requestPathParamsSchema?: RequestPathParamsSchema
  requestQuerySchema?: z.ZodType
  requestHeaderSchema?: z.ZodType
  responseHeaderSchema?: z.ZodType
  responseSchemasByStatusCode?: ResponseSchemasByStatusCode
  serverSentEventSchemas?: Record<string, z.ZodType>

  metadata?: Record<string, unknown>
  summary?: string
  description?: string
  tags?: readonly string[]
}

export type GetRouteContract = CommonRouteContract & {
  method: 'get'
  requestBodySchema?: never
}

export type DeleteRouteContract = CommonRouteContract & {
  method: 'delete'
  requestBodySchema?: never
}

export type PayloadRouteContract = CommonRouteContract & {
  method: 'post' | 'put' | 'patch'
  requestBodySchema: ContractNoBodyType | z.ZodType
}

export type RouteContract = GetRouteContract | DeleteRouteContract | PayloadRouteContract

/**
 * Helper to prevent extra keys. If T has keys not in U, it forces an error.
 */
type Exactly<T, U> = T & {
  [K in keyof T]: K extends keyof U ? T[K] : never
}

type TypedPathRouteContract<T extends RequestPathParamsSchema> = Omit<
  RouteContract,
  'pathResolver' | 'requestPathParamsSchema'
> & {
  pathResolver: RoutePathResolver<InferSchemaOutput<T>>
  requestPathParamsSchema?: T
}

export const defineRouteContract = <
  PathParamsSchema extends RequestPathParamsSchema,
  const Contract extends TypedPathRouteContract<PathParamsSchema>,
>(
  contract: Exactly<Contract, TypedPathRouteContract<PathParamsSchema>> & {
    requestPathParamsSchema?: PathParamsSchema
  },
): Contract => contract

export const mapRouteContractToPath = (routeConfig: RouteContract): string => {
  if (!routeConfig.requestPathParamsSchema) {
    return routeConfig.pathResolver(undefined)
  }

  const resolverParams = Object.keys(routeConfig.requestPathParamsSchema.shape).reduce<
    Record<string, string>
  >((acc, key) => {
    acc[key] = `:${key}`

    return acc
  }, {})

  return routeConfig.pathResolver(resolverParams)
}

export const describeRouteContract = (routeConfig: RouteContract): string => {
  return `${routeConfig.method.toUpperCase()} ${mapRouteContractToPath(routeConfig)}`
}

export const getSuccessResponseSchema = (routeConfig: RouteContract): z.ZodType | null => {
  const { responseSchemasByStatusCode } = routeConfig
  if (!responseSchemasByStatusCode) {
    return null
  }

  const schemas: z.ZodType[] = []

  for (const code of SUCCESSFUL_HTTP_STATUS_CODES) {
    const value = responseSchemasByStatusCode[code]

    if (!value) {
      continue
    }

    if (typeof value === 'symbol' || isTypedNonJsonResponse(value)) {
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

  for (const code of SUCCESSFUL_HTTP_STATUS_CODES) {
    const value = responseSchemasByStatusCode[code]

    if (value && typeof value !== 'symbol') {
      isEmptyResponseExpected = false
      break
    }
  }

  return isEmptyResponseExpected
}

export const getIsNonJsonResponseExpected = (routeConfig: RouteContract): boolean => {
  const { responseSchemasByStatusCode } = routeConfig
  if (!responseSchemasByStatusCode) {
    return false
  }

  for (const code of SUCCESSFUL_HTTP_STATUS_CODES) {
    const value = responseSchemasByStatusCode[code]
    if (value !== undefined && isTypedNonJsonResponse(value)) {
      return true
    }
  }

  return false
}
