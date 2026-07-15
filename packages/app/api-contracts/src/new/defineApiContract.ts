import type { z } from 'zod/v4'
import type {
  CommonRouteDefinitionMetadata,
  InferSchemaOutput,
  RoutePathResolver,
} from '../apiContracts.ts'
import { SUCCESSFUL_HTTP_STATUS_CODES } from '../HttpStatusCodes.ts'
import type { DistributiveOmit, Exactly } from '../typeUtils.ts'
import type { ContractNoBody } from './constants.ts'
import {
  type ApiContractResponse,
  isContentResponseEntry,
  isSseBody,
  type ResponseEntry,
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
  /** Human-readable summary of the route. */
  summary: string
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

/** Collects every SSE event-schema map declared by a single response entry (legacy or content-map). */
const collectSseSchemaMaps = (
  value: ApiContractResponse | ResponseEntry,
): SseSchemaByEventName[] => {
  if (isContentResponseEntry(value)) {
    const maps: SseSchemaByEventName[] = []
    for (const descriptor of Object.values(value.content ?? {})) {
      if (isSseBody(descriptor)) {
        maps.push(descriptor.schemaByEventName)
      }
    }
    return maps
  }

  return []
}

export const getSseSchemaByEventName = (routeConfig: ApiContract): SseSchemaByEventName | null => {
  const result: SseSchemaByEventName = {}

  for (const value of Object.values(routeConfig.responsesByStatusCode)) {
    if (value) {
      for (const map of collectSseSchemaMaps(value)) {
        Object.assign(result, map)
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null
}

export const hasAnySuccessSseResponse = (apiContract: ApiContract): boolean => {
  for (const code of [...SUCCESSFUL_HTTP_STATUS_CODES, '2xx' as const, 'default' as const]) {
    const value = apiContract.responsesByStatusCode[code]

    if (value && collectSseSchemaMaps(value).length > 0) {
      return true
    }
  }

  return false
}
