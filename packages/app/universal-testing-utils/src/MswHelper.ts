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

// We do not control what data is used to call the endpoint, so it is safe to assume its unknown
type HandleRequest<ResponseBody> = (dto: unknown) => ResponseBody

export type MockWithImplementationParams<PathParams, ResponseBody> = {
  pathParams: PathParams
  handleRequest: HandleRequest<ResponseBody>
} & CommonMockParams

export type MockWithImplementationParamsNoPath<ResponseBody> = {
  handleRequest: HandleRequest<ResponseBody>
} & CommonMockParams

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

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
    const method: HttpMethod = contract.method
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
      ? Object.keys(
          // @ts-expect-error this is fine
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
    const method: HttpMethod = contract.method
    server.use(
      http[method](resolvedPath, () =>
        HttpResponse.json(params.responseBody, {
          status: params.responseCode,
        }),
      ),
    )
  }

  mockValidResponseWithImplementation<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
    RequestHeaderSchema extends z.Schema | undefined = undefined,
    IsNonJSONResponseExpected extends boolean = false,
    IsEmptyResponseExpected extends boolean = false,
  >(
    contract: CommonRouteDefinition<
      InferSchemaOutput<PathParamsSchema>,
      ResponseBodySchema,
      PathParamsSchema,
      RequestQuerySchema,
      RequestHeaderSchema,
      IsNonJSONResponseExpected,
      IsEmptyResponseExpected
    >,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockWithImplementationParamsNoPath<InferSchemaInput<ResponseBodySchema>>
      : MockWithImplementationParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<ResponseBodySchema>
        >,
  ): void {
    const path = contract.requestPathParamsSchema
      ? // @ts-expect-error this is safe
        contract.pathResolver(params.pathParams)
      : mapRouteToPath(contract)

    const resolvedPath = joinURL(this.baseUrl, path)

    // @ts-expect-error
    const method: HttpMethod = contract.method

    server.use(
      http[method](resolvedPath, async ({ request }) =>
        HttpResponse.json(params.handleRequest(await request.json()), {
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
