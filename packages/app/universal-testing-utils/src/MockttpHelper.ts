// biome-ignore-all lint/suspicious/noExplicitAny: Expected for mocking
import {
  type CommonRouteDefinition,
  type DualModeContractDefinition,
  type InferSchemaInput,
  mapRouteToPath,
  type PayloadRouteDefinition,
  type SSEContractDefinition,
  type SSEEventSchemas,
} from '@lokalise/api-contracts'
import type { Mockttp, RequestRuleBuilder } from 'mockttp'
import type { z } from 'zod/v4'

export type PayloadMockParams<PathParams, QueryParams, ResponseBody> = {
  pathParams: PathParams
  responseCode?: number
  responseBody: ResponseBody
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

export type PayloadMockParamsNoPath<QueryParams, ResponseBody> = {
  responseCode?: number
  responseBody: ResponseBody
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

export type SseMockEvent<Events extends SSEEventSchemas> = {
  [K in keyof Events & string]: { event: K; data: z.input<Events[K]> }
}[keyof Events & string]

export type SseMockParams<PathParams, QueryParams, Events extends SSEEventSchemas> = {
  pathParams: PathParams
  responseCode?: number
  events: SseMockEvent<Events>[]
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

export type SseMockParamsNoPath<QueryParams, Events extends SSEEventSchemas> = {
  responseCode?: number
  events: SseMockEvent<Events>[]
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

export function formatSseResponse(events: { event: string; data: unknown }[]): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n`).join('\n')
}

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'
type SseHttpMethod = 'get' | 'post' | 'patch' | 'put'

export class MockttpHelper {
  private readonly mockServer: Mockttp

  constructor(mockServer: Mockttp) {
    this.mockServer = mockServer
  }

  mockAnyResponse<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract:
      | CommonRouteDefinition<
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >
      | PayloadRouteDefinition<
          z.Schema | undefined,
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >
      | DualModeContractDefinition<
          any,
          PathParamsSchema,
          RequestQuerySchema,
          any,
          any,
          ResponseBodySchema,
          any,
          any,
          any
        >,
    params: PathParamsSchema extends undefined
      ? PayloadMockParamsNoPath<InferSchemaInput<RequestQuerySchema>, any>
      : PayloadMockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestQuerySchema>,
          any
        >,
  ): Promise<void> {
    return this.mockValidResponse(contract as any, params)
  }

  async mockValidResponse<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract:
      | CommonRouteDefinition<
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >
      | PayloadRouteDefinition<
          z.Schema | undefined,
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >
      | DualModeContractDefinition<
          any,
          PathParamsSchema,
          RequestQuerySchema,
          any,
          any,
          ResponseBodySchema,
          any,
          any,
          any
        >,
    params: PathParamsSchema extends undefined
      ? PayloadMockParamsNoPath<
          InferSchemaInput<RequestQuerySchema>,
          InferSchemaInput<ResponseBodySchema>
        >
      : PayloadMockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestQuerySchema>,
          InferSchemaInput<ResponseBodySchema>
        >,
  ): Promise<void> {
    // @ts-expect-error this is safe
    const pathParams = params.pathParams

    const path =
      contract.requestPathParamsSchema && pathParams && contract.pathResolver
        ? contract.pathResolver(pathParams)
        : mapRouteToPath(contract)

    let mockttp: RequestRuleBuilder
    const method = ('method' in contract ? contract.method : 'get') as HttpMethod

    switch (method) {
      case 'get':
        mockttp = this.mockServer.forGet(path)
        break
      case 'delete':
        mockttp = this.mockServer.forDelete(path)
        break
      case 'post':
        mockttp = this.mockServer.forPost(path)
        break
      case 'patch':
        mockttp = this.mockServer.forPatch(path)
        break
      case 'put':
        mockttp = this.mockServer.forPut(path)
        break
      default:
        throw new Error(`Unsupported method ${method}`)
    }

    const queryParams = params.queryParams
    if (queryParams) {
      // @ts-expect-error this is safe
      mockttp = mockttp.withQuery(queryParams)
    }

    const isDualMode = 'isDualMode' in contract && contract.isDualMode === true

    if (isDualMode) {
      await mockttp.thenCallback((request) => {
        const accept = request.headers['accept'] ?? ''
        if (accept.includes('text/event-stream')) {
          return { statusCode: 503 }
        }
        return {
          statusCode: params.responseCode ?? 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params.responseBody),
        }
      })
    } else {
      await mockttp.thenJson(params.responseCode ?? 200, params.responseBody as object)
    }
  }

  async mockSseResponse<
    Events extends SSEEventSchemas,
    PathParamsSchema extends z.Schema | undefined = undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract:
      | SSEContractDefinition<any, PathParamsSchema, RequestQuerySchema, any, any, Events, any>
      | DualModeContractDefinition<
          any,
          PathParamsSchema,
          RequestQuerySchema,
          any,
          any,
          any,
          Events,
          any,
          any
        >,
    params: PathParamsSchema extends z.Schema
      ? SseMockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestQuerySchema>,
          Events
        >
      : SseMockParamsNoPath<InferSchemaInput<RequestQuerySchema>, Events>,
  ): Promise<void> {
    // @ts-expect-error this is safe
    const pathParams = params.pathParams

    const path = contract.requestPathParamsSchema
      ? contract.pathResolver(pathParams)
      : contract.pathResolver({} as any)

    let mockttp: RequestRuleBuilder
    const method = contract.method as SseHttpMethod

    switch (method) {
      case 'get':
        mockttp = this.mockServer.forGet(path)
        break
      case 'post':
        mockttp = this.mockServer.forPost(path)
        break
      case 'patch':
        mockttp = this.mockServer.forPatch(path)
        break
      case 'put':
        mockttp = this.mockServer.forPut(path)
        break
      default:
        throw new Error(`Unsupported method ${method}`)
    }

    const queryParams = params.queryParams
    if (queryParams) {
      // @ts-expect-error this is safe
      mockttp = mockttp.withQuery(queryParams)
    }

    const body = formatSseResponse(params.events)
    const isDualMode = 'isDualMode' in contract && contract.isDualMode === true

    await mockttp.thenCallback((request) => {
      if (isDualMode) {
        const accept = request.headers['accept'] ?? ''
        if (!accept.includes('text/event-stream')) {
          return { statusCode: 503 }
        }
      }

      return {
        statusCode: params.responseCode ?? 200,
        headers: { 'content-type': 'text/event-stream' },
        body,
      }
    })
  }
}
