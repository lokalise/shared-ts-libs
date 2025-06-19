import {
  type CommonRouteDefinition,
  type InferSchemaInput,
  mapRouteToPath,
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

export class MockttpHelper {
  private readonly mockServer: Mockttp

  constructor(mockServer: Mockttp) {
    this.mockServer = mockServer
  }

  async mockValidResponse<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract: CommonRouteDefinition<ResponseBodySchema, PathParamsSchema>,
    params: PathParamsSchema extends undefined
      ? PayloadMockParamsNoPath<InferSchemaInput<ResponseBodySchema>>
      : PayloadMockParams<InferSchemaInput<PathParamsSchema>, InferSchemaInput<ResponseBodySchema>>,
  ): Promise<void> {
    const path = contract.requestPathParamsSchema
      ? // @ts-expect-error this is safe
        contract.pathResolver(params.pathParams)
      : mapRouteToPath(contract)
    let mockttp: RequestRuleBuilder
    // @ts-expect-error this is safe
    const method: 'get' | 'delete' | 'post' | 'patch' | 'put' = contract.method

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
