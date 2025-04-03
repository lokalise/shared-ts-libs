import {
  type CommonRouteDefinition,
  type InferSchemaOutput,
  mapRouteToPath,
} from '@lokalise/api-contracts'
import type { InferSchemaInput } from '@lokalise/api-contracts'
import type { Mockttp, RequestRuleBuilder } from 'mockttp'
import type { z } from 'zod'

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
  async mockValidResponse<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract: CommonRouteDefinition<
      InferSchemaOutput<PathParamsSchema>,
      ResponseBodySchema,
      PathParamsSchema
    >,
    mockServer: Mockttp,
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

    if (method === 'get') {
      mockttp = mockServer.forGet(path)
    } else if (method === 'delete') {
      mockttp = mockServer.forDelete(path)
    } else if (method === 'post') {
      mockttp = mockServer.forPost(path)
    } else if (method === 'patch') {
      mockttp = mockServer.forPatch(path)
    } else if (method === 'put') {
      mockttp = mockServer.forPut(path)
    } else {
      throw new Error(`Unsupported method ${method}`)
    }

    await mockttp.thenJson(params.responseCode ?? 200, params.responseBody)
  }
}
