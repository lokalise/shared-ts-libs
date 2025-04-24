import {
  type CommonRouteDefinition,
  type InferSchemaOutput,
  mapRouteToPath,
} from '@lokalise/api-contracts'
import type { InferSchemaInput } from '@lokalise/api-contracts'
import { http, HttpResponse } from 'msw'
import type { SetupServerApi } from 'msw/node'
import type { ZodObject, z } from 'zod'

export type CommonMockParams = {
  responseCode?: number
}

export type MockParams<PathParams, ResponseBody> = {
  pathParams: PathParams
  responseBody: ResponseBody
} & CommonMockParams

export type MockParamsNoPath<ResponseBody> = {
  responseBody: ResponseBody
} & CommonMockParams

function joinURL(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export class MswHelper {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  mockValidResponse<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract: CommonRouteDefinition<
      InferSchemaOutput<PathParamsSchema>,
      ResponseBodySchema,
      PathParamsSchema
    >,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockParamsNoPath<InferSchemaInput<ResponseBodySchema>>
      : MockParams<InferSchemaInput<PathParamsSchema>, InferSchemaInput<ResponseBodySchema>>,
  ): void {
    const path = contract.requestPathParamsSchema
      ? // @ts-expect-error this is safe
        contract.pathResolver(params.pathParams)
      : mapRouteToPath(contract)

    const resolvedPath = joinURL(this.baseUrl, path)
    // @ts-expect-error
    const method: 'get' | 'delete' | 'post' | 'patch' | 'put' = contract.method
    server.use(
      http[method](resolvedPath, () =>
        HttpResponse.json(params.responseBody, {
          status: params.responseCode,
        }),
      ),
    )
  }

  mockValidResponseWithAnyPath<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract: CommonRouteDefinition<
      InferSchemaOutput<PathParamsSchema>,
      ResponseBodySchema,
      PathParamsSchema
    >,
    server: SetupServerApi,
    params: MockParamsNoPath<InferSchemaInput<ResponseBodySchema>>,
  ): void {
    const pathParams = contract.requestPathParamsSchema
      ? // @ts-expect-error this is fine
        Object.keys(
          (contract.requestPathParamsSchema as unknown as ZodObject<unknown>).shape,
        ).reduce(
          (acc, value) => {
            acc[value] = '*'
            return acc
          },
          {} as Record<string, string>,
        )
      : {}

    const path = contract.requestPathParamsSchema
      ? // @ts-expect-error this is safe
        contract.pathResolver(pathParams)
      : mapRouteToPath(contract)

    const resolvedPath = joinURL(this.baseUrl, path)
    // @ts-expect-error
    const method: 'get' | 'delete' | 'post' | 'patch' | 'put' = contract.method
    server.use(
      http[method](resolvedPath, () =>
        HttpResponse.json(params.responseBody, {
          status: params.responseCode,
        }),
      ),
    )
  }

  mockAnyResponse<PathParamsSchema extends z.Schema | undefined>(
    contract: CommonRouteDefinition<
      InferSchemaOutput<PathParamsSchema>,
      // biome-ignore lint/suspicious/noExplicitAny: we accept any input
      any,
      PathParamsSchema
    >,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockParamsNoPath<
          // biome-ignore lint/suspicious/noExplicitAny: we accept any input
          InferSchemaInput<any>
        >
      : MockParams<
          InferSchemaInput<PathParamsSchema>,
          // biome-ignore lint/suspicious/noExplicitAny: we accept any input
          InferSchemaInput<any>
        >,
  ): void {
    // biome-ignore lint/suspicious/noExplicitAny: we accept any input
    this.mockValidResponse<any, PathParamsSchema>(contract, server, params)
  }
}
