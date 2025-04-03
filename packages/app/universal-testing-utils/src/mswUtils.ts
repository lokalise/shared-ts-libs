import {
  type InferSchemaOutput,
  type PayloadRouteDefinition,
  mapRouteToPath,
} from '@lokalise/api-contracts'
import type { InferSchemaInput } from '@lokalise/api-contracts'
import { http, HttpResponse } from 'msw'
import type { SetupServerApi } from 'msw/node'
import type { z } from 'zod'

export type CommonMockParams = {
  baseUrl: string
  responseCode?: number
}

export type PayloadMockParams<PathParams, ResponseBody> = {
  pathParams: PathParams
  responseBody: ResponseBody
} & CommonMockParams

export type PayloadMockParamsNoPath<ResponseBody> = {
  responseBody: ResponseBody
} & CommonMockParams

function joinURL(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function mockValidPayloadResponse<
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
  server: SetupServerApi,
  params: PathParamsSchema extends undefined
    ? PayloadMockParamsNoPath<InferSchemaInput<ResponseBodySchema>>
    : PayloadMockParams<InferSchemaInput<PathParamsSchema>, InferSchemaInput<ResponseBodySchema>>,
): void {
  const path = contract.requestPathParamsSchema
    ? // @ts-expect-error this is safe
      contract.pathResolver(params.pathParams)
    : mapRouteToPath(contract)

  const resolvedPath = joinURL(params.baseUrl, path)
  server.use(
    http[contract.method](resolvedPath, () =>
      HttpResponse.json(params.responseBody, {
        status: params.responseCode,
      }),
    ),
  )
}
