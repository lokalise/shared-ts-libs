// biome-ignore-all lint/suspicious/noExplicitAny: Expected for mocking
import {
  type CommonRouteDefinition,
  type InferSchemaInput,
  mapRouteToPath,
  type PayloadRouteDefinition,
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

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

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
        >,
    params: PathParamsSchema extends undefined
      ? PayloadMockParamsNoPath<InferSchemaInput<RequestQuerySchema>, any>
      : PayloadMockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestQuerySchema>,
          any
        >,
  ): Promise<void> {
    return this.mockValidResponse(contract, params)
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

    await mockttp.thenJson(params.responseCode ?? 200, params.responseBody as object)
  }
}
