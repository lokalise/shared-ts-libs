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

export type DualModeMockParams<
  PathParams,
  QueryParams,
  ResponseBody,
  Events extends SSEEventSchemas,
> = {
  pathParams: PathParams
  responseCode?: number
  responseBody: ResponseBody
  events: SseMockEvent<Events>[]
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

export type DualModeMockParamsNoPath<QueryParams, ResponseBody, Events extends SSEEventSchemas> = {
  responseCode?: number
  responseBody: ResponseBody
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

  private resolveMethodBuilder(method: string, path: string): RequestRuleBuilder {
    switch (method as HttpMethod) {
      case 'get':
        return this.mockServer.forGet(path)
      case 'delete':
        return this.mockServer.forDelete(path)
      case 'post':
        return this.mockServer.forPost(path)
      case 'patch':
        return this.mockServer.forPatch(path)
      case 'put':
        return this.mockServer.forPut(path)
      default:
        throw new Error(`Unsupported method ${method}`)
    }
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
          any
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
    return this.mockRestResponse(contract, params)
  }

  private async mockRestResponse(contract: any, params: any): Promise<void> {
    const pathParams = params.pathParams

    const path =
      contract.requestPathParamsSchema && pathParams && contract.pathResolver
        ? contract.pathResolver(pathParams)
        : mapRouteToPath(contract)

    const method = ('method' in contract ? contract.method : 'get') as HttpMethod
    let mockttp = this.resolveMethodBuilder(method, path)

    const queryParams = params.queryParams
    if (queryParams) {
      mockttp = mockttp.withQuery(queryParams)
    }

    await mockttp.thenJson(params.responseCode ?? 200, params.responseBody as object)
  }

  // Overload: Dual-mode contract — requires both responseBody and events
  mockValidResponse<
    ResponseBodySchema extends z.Schema,
    Events extends SSEEventSchemas,
    PathParamsSchema extends z.Schema | undefined = undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract: DualModeContractDefinition<
      any,
      PathParamsSchema,
      RequestQuerySchema,
      any,
      any,
      ResponseBodySchema,
      Events,
      any,
      any
    >,
    params: PathParamsSchema extends z.Schema
      ? DualModeMockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestQuerySchema>,
          InferSchemaInput<ResponseBodySchema>,
          Events
        >
      : DualModeMockParamsNoPath<
          InferSchemaInput<RequestQuerySchema>,
          InferSchemaInput<ResponseBodySchema>,
          Events
        >,
  ): Promise<void>

  // Overload: SSE contract — requires events, no responseBody
  mockValidResponse<
    Events extends SSEEventSchemas,
    PathParamsSchema extends z.Schema | undefined = undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract: SSEContractDefinition<
      any,
      PathParamsSchema,
      RequestQuerySchema,
      any,
      any,
      Events,
      any
    >,
    params: PathParamsSchema extends z.Schema
      ? SseMockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestQuerySchema>,
          Events
        >
      : SseMockParamsNoPath<InferSchemaInput<RequestQuerySchema>, Events>,
  ): Promise<void>

  // Overload: REST contract — requires responseBody, no events
  mockValidResponse<
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
          any
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
  ): Promise<void>

  // Implementation
  async mockValidResponse(contract: any, params: any): Promise<void> {
    if ('isDualMode' in contract && contract.isDualMode) {
      await this.mockDualModeHandler(contract, params)
    } else if ('isSSE' in contract && contract.isSSE) {
      await this.mockSseHandler(contract, params)
    } else {
      await this.mockRestResponse(contract, params)
    }
  }

  private async mockDualModeHandler(contract: any, params: any): Promise<void> {
    const pathParams = params.pathParams

    const path = contract.requestPathParamsSchema
      ? contract.pathResolver(pathParams)
      : contract.pathResolver({} as any)

    const method = contract.method as SseHttpMethod
    let mockttp = this.resolveMethodBuilder(method, path)

    if (params.queryParams) {
      mockttp = mockttp.withQuery(params.queryParams)
    }

    const sseBody = formatSseResponse(params.events)
    const jsonBody = JSON.stringify(contract.successResponseBodySchema.parse(params.responseBody))

    await mockttp.thenCallback((request) => {
      const accept = request.headers.accept ?? ''
      if (accept.includes('text/event-stream')) {
        return {
          statusCode: params.responseCode ?? 200,
          headers: { 'content-type': 'text/event-stream' },
          body: sseBody,
        }
      }

      return {
        statusCode: params.responseCode ?? 200,
        headers: { 'content-type': 'application/json' },
        body: jsonBody,
      }
    })
  }

  private async mockSseHandler(contract: any, params: any): Promise<void> {
    const pathParams = params.pathParams

    const path = contract.requestPathParamsSchema
      ? contract.pathResolver(pathParams)
      : contract.pathResolver({} as any)

    const method = contract.method as SseHttpMethod
    let mockttp = this.resolveMethodBuilder(method, path)

    if (params.queryParams) {
      mockttp = mockttp.withQuery(params.queryParams)
    }

    const body = formatSseResponse(params.events)

    await mockttp.thenCallback(() => ({
      statusCode: params.responseCode ?? 200,
      headers: { 'content-type': 'text/event-stream' },
      body,
    }))
  }
}
