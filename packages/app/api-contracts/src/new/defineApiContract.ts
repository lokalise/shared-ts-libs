import { z } from 'zod/v4'
import type {
  CommonRouteDefinitionMetadata,
  InferSchemaOutput,
  RoutePathResolver,
} from '../apiContracts.ts'
import { SUCCESSFUL_HTTP_STATUS_CODES } from '../HttpStatusCodes.ts'
import type { DistributiveOmit, Exactly } from '../typeUtils.ts'
import { ContractNoBody } from './constants.ts'
import {
  isAnyOfResponses,
  isBlobResponse,
  isNoBodyResponse,
  isSseResponse,
  isTextResponse,
  type ResponsesByStatusCode,
  type SseSchemaByEventName,
} from './contractResponse.ts'

export type RequestPathParamsSchema = z.ZodObject
export type RequestQuerySchema = z.ZodObject
export type RequestHeaderSchema = z.ZodObject
export type ResponseHeaderSchema = z.ZodObject

export type CommonApiContract = {
  // biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with generics
  pathResolver: RoutePathResolver<any>
  requestPathParamsSchema?: RequestPathParamsSchema
  requestQuerySchema?: RequestQuerySchema
  requestHeaderSchema?: RequestHeaderSchema
  responseHeaderSchema?: ResponseHeaderSchema
  responsesByStatusCode: ResponsesByStatusCode

  metadata?: CommonRouteDefinitionMetadata
  summary?: string
  description?: string
  tags?: readonly string[]
}

export type GetApiContract = CommonApiContract & {
  method: 'get'
  requestBodySchema?: never
}

export type DeleteApiContract = CommonApiContract & {
  method: 'delete'
  requestBodySchema?: never
}

export type PayloadApiContract = CommonApiContract & {
  method: 'post' | 'put' | 'patch'
  requestBodySchema: typeof ContractNoBody | z.ZodType
}

export type ApiContract = GetApiContract | DeleteApiContract | PayloadApiContract

type TypedPathApiContract<TPathParamsSchema extends RequestPathParamsSchema | undefined> =
  DistributiveOmit<ApiContract, 'pathResolver' | 'requestPathParamsSchema'> & {
    pathResolver: RoutePathResolver<InferSchemaOutput<TPathParamsSchema>>
    requestPathParamsSchema?: TPathParamsSchema
  }

export const defineApiContract = <
  TPathParamsSchema extends RequestPathParamsSchema | undefined = undefined,
  const TContract extends
    TypedPathApiContract<TPathParamsSchema> = TypedPathApiContract<TPathParamsSchema>,
>(
  contract: Exactly<TContract, TypedPathApiContract<TPathParamsSchema>> & {
    requestPathParamsSchema?: TPathParamsSchema
  },
): TContract => contract

export const mapApiContractToPath = (routeConfig: ApiContract): string => {
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

export const describeApiContract = (routeConfig: ApiContract): string => {
  return `${routeConfig.method.toUpperCase()} ${mapApiContractToPath(routeConfig)}`
}

export const getSseSchemaByEventName = (routeConfig: ApiContract): SseSchemaByEventName | null => {
  const result: SseSchemaByEventName = {}

  for (const value of Object.values(routeConfig.responsesByStatusCode)) {
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

export const hasAnySuccessSseResponse = (apiContract: ApiContract): boolean => {
  for (const code of [...SUCCESSFUL_HTTP_STATUS_CODES, '2xx' as const, 'default' as const]) {
    const value = apiContract.responsesByStatusCode[code]

    if (!value) {
      continue
    }

    if (isSseResponse(value)) {
      return true
    } else if (isAnyOfResponses(value)) {
      for (const response of value.responses) {
        if (isSseResponse(response)) {
          return true
        }
      }
    }
  }

  return false
}

/** @deprecated No known consumers — will be removed in a future release. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it is acceptable
export const getSuccessResponseSchema = (routeConfig: ApiContract): z.ZodType | null => {
  const schemas: z.ZodType[] = []
  let hasDirectNonJsonEntry = false

  for (const code of SUCCESSFUL_HTTP_STATUS_CODES) {
    const value = routeConfig.responsesByStatusCode[code]

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
      value === ContractNoBody ||
      isNoBodyResponse(value) ||
      isSseResponse(value) ||
      isTextResponse(value) ||
      isBlobResponse(value)
    ) {
      hasDirectNonJsonEntry = true
    } else {
      schemas.push(value)
    }
  }

  if (schemas.length > 1) {
    return z.union(schemas)
  }

  const firstSchema = schemas.at(0)
  if (firstSchema) {
    return firstSchema
  }

  return hasDirectNonJsonEntry ? z.never() : null
}

/** @deprecated No known consumers — will be removed in a future release. */
export const getIsEmptyResponseExpected = (routeConfig: ApiContract): boolean => {
  let isEmptyResponseExpected = true

  for (const code of SUCCESSFUL_HTTP_STATUS_CODES) {
    const value = routeConfig.responsesByStatusCode[code]

    if (value && value !== ContractNoBody && !isNoBodyResponse(value)) {
      isEmptyResponseExpected = false
      break
    }
  }

  return isEmptyResponseExpected
}
