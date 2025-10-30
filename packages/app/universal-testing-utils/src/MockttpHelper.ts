// biome-ignore-all lint/suspicious/noExplicitAny: Expected for mocking
import {
  type CommonRouteDefinition,
  type InferSchemaInput,
  mapRouteToPath,
  type PayloadRouteDefinition,
} from '@lokalise/api-contracts'
import type { Mockttp, RequestRuleBuilder } from 'mockttp'
import type { z } from 'zod/v4'

export type PayloadMockParams<PathParams, ResponseBody> = {
  pathParams: PathParams
  responseCode?: number
  responseBody: ResponseBody
}

export type PayloadMockParamsNoPath<ResponseBody> = {
  responseCode?: number
  responseBody: ResponseBody
}

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

export class MockttpHelper {
  private readonly mockServer: Mockttp

  constructor(mockServer: Mockttp) {
    this.mockServer = mockServer
  }

  mockAnyResponse<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract:
      | CommonRouteDefinition<
          ResponseBodySchema,
          PathParamsSchema,
          z.Schema | undefined,
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
          z.Schema | undefined,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >,
    params: PathParamsSchema extends undefined
      ? PayloadMockParamsNoPath<any>
      : PayloadMockParams<InferSchemaInput<PathParamsSchema>, any>,
  ): Promise<void> {
    return this.mockValidResponse(contract, params)
  }

  async mockValidResponse<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract:
      | CommonRouteDefinition<
          ResponseBodySchema,
          PathParamsSchema,
          z.Schema | undefined,
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
          z.Schema | undefined,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >,
    params: PathParamsSchema extends undefined
      ? PayloadMockParamsNoPath<InferSchemaInput<ResponseBodySchema>>
      : PayloadMockParams<InferSchemaInput<PathParamsSchema>, InferSchemaInput<ResponseBodySchema>>,
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

    await mockttp.thenJson(params.responseCode ?? 200, params.responseBody as object)
  }
}
