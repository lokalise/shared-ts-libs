import { z } from 'zod/v4'
import type { InferSchemaOutput, RoutePathResolver } from '../apiContracts.ts'
import { SUCCESSFUL_HTTP_STATUS_CODES } from '../HttpStatusCodes.ts'
import type { Exactly } from '../typeUtils.ts'
import { ContractNoBody, type ContractNoBodyType } from './constants.ts'
import {
  isAnyOfResponses,
  isBlobResponse,
  isSseResponse,
  isTextResponse,
  type ResponseSchemasByStatusCode,
  type SseSchemaByEventName,
} from './contractResponse.ts'

export type RequestPathParamsSchema = z.ZodObject

export type CommonRouteContract = {
  // biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with generics
  pathResolver: RoutePathResolver<any>
  requestPathParamsSchema?: RequestPathParamsSchema
  requestQuerySchema?: z.ZodType
  requestHeaderSchema?: z.ZodType
  responseHeaderSchema?: z.ZodType
  responseSchemasByStatusCode: ResponseSchemasByStatusCode

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

export const getSseSchemaByEventName = (
  routeConfig: RouteContract,
): SseSchemaByEventName | null => {
  const result: SseSchemaByEventName = {}

  for (const value of Object.values(routeConfig.responseSchemasByStatusCode)) {
    if (isSseResponse(value)) {
      Object.assign(result, value.schemaByEventName)
    } else if (isAnyOfResponses(value)) {
      for (const response of value.responses) {
        if (isSseResponse(response)) {
          Object.assign(result, response.schemaByEventName)
        }
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it is acceptable
export const getSuccessResponseSchema = (routeConfig: RouteContract): z.ZodType | null => {
  const schemas: z.ZodType[] = []

  for (const code of SUCCESSFUL_HTTP_STATUS_CODES) {
    const value = routeConfig.responseSchemasByStatusCode[code]

    if (!value) {
      continue
    }

    if (isAnyOfResponses(value)) {
      for (const response of value.responses) {
        if (!isSseResponse(response) && !isTextResponse(response) && !isBlobResponse(response)) {
          schemas.push(response)
        }
      }
    } else if (
      value !== ContractNoBody &&
      !isSseResponse(value) &&
      !isTextResponse(value) &&
      !isBlobResponse(value)
    ) {
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
  let isEmptyResponseExpected = true

  for (const code of SUCCESSFUL_HTTP_STATUS_CODES) {
    const value = routeConfig.responseSchemasByStatusCode[code]

    if (value && value !== ContractNoBody) {
      isEmptyResponseExpected = false
      break
    }
  }

  return isEmptyResponseExpected
}
