import {
  type InferSchemaOutput,
  type PayloadRouteDefinition,
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

export async function mockValidPayloadResponse<
  RequestBodySchema extends z.Schema,
  ResponseBodySchema extends z.Schema,
  PathParamsSchema extends z.Schema | undefined,
>(
  contract: PayloadRouteDefinition<
    InferSchemaOutput<PathParamsSchema>,
    RequestBodySchema,
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

  if (contract.method === 'post') {
    mockttp = mockServer.forPost(path)
  } else if (contract.method === 'patch') {
    mockttp = mockServer.forPatch(path)
  } else if (contract.method === 'put') {
    mockttp = mockServer.forPut(path)
  } else {
    throw new Error(`Unsupported method ${contract.method}`)
  }

  await mockttp.thenJson(params.responseCode ?? 200, params.responseBody)
}
