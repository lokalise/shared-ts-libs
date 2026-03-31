import { z } from 'zod/v4'
import type { InferSchemaOutput, RoutePathResolver } from '../apiContracts.ts'
import { SUCCESSFUL_HTTP_STATUS_CODES } from '../HttpStatusCodes.ts'
import type { Exactly } from '../typeUtils.ts'
import { ContractNoBody } from './constants.ts'
import {
  isAnyOfResponses,
  isBlobResponse,
  isSseResponse,
  isTextResponse,
  type ResponseSchemasByStatusCode,
  type SseSchemaByEventName,
} from './contractResponse.ts'

export type RequestPathParamsSchema = z.ZodObject

export type CommonApiContract = {
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

type TypedPathApiContract<T extends RequestPathParamsSchema> = Omit<
  ApiContract,
  'pathResolver' | 'requestPathParamsSchema'
> & {
  pathResolver: RoutePathResolver<InferSchemaOutput<T>>
  requestPathParamsSchema?: T
}

export const defineApiContract = <
  PathParamsSchema extends RequestPathParamsSchema,
  const Contract extends TypedPathApiContract<PathParamsSchema>,
>(
  contract: Exactly<Contract, TypedPathApiContract<PathParamsSchema>> & {
    requestPathParamsSchema?: PathParamsSchema
  },
): Contract => contract

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
export const getSuccessResponseSchema = (routeConfig: ApiContract): z.ZodType | null => {
  const schemas: z.ZodType[] = []
  let hasDirectNonJsonEntry = false

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
      value === ContractNoBody ||
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
  if (schemas.length === 1) {
    return schemas[0]!
  }
  return hasDirectNonJsonEntry ? z.never() : null
}

export const getIsEmptyResponseExpected = (routeConfig: ApiContract): boolean => {
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
