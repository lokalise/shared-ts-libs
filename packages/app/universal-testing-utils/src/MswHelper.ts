import {
  type CommonRouteDefinition,
  type InferSchemaInput,
  type InferSchemaOutput,
  type PayloadRouteDefinition,
  mapRouteToPath,
} from '@lokalise/api-contracts'
import {
  http,
  type DefaultBodyType,
  HttpResponse,
  type HttpResponseResolver,
  type PathParams,
} from 'msw'
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

export type MockWithImplementationParamsNoPath<
  Params extends PathParams<keyof Params>,
  RequestBody extends DefaultBodyType,
  ResponseBody extends DefaultBodyType,
> = {
  handleRequest: (
    dto: Parameters<HttpResponseResolver<Params, RequestBody, ResponseBody>>[0],
  ) => ResponseBody | Promise<ResponseBody>
} & CommonMockParams

export type MockWithImplementationParams<
  Params extends PathParams<keyof Params>,
  RequestBody extends DefaultBodyType,
  ResponseBody extends DefaultBodyType,
> = {
  pathParams: Params
} & MockWithImplementationParamsNoPath<Params, RequestBody, ResponseBody>

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
    RequestBodySchema extends z.Schema | undefined = undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
    RequestHeaderSchema extends z.Schema | undefined = undefined,
    IsNonJSONResponseExpected extends boolean = false,
    IsEmptyResponseExpected extends boolean = false,
  >(
    contract:
      | CommonRouteDefinition<
          InferSchemaOutput<PathParamsSchema>,
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          RequestHeaderSchema,
          IsNonJSONResponseExpected,
          IsEmptyResponseExpected
        >
      | PayloadRouteDefinition<InferSchemaOutput<PathParamsSchema>, RequestBodySchema>,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockWithImplementationParamsNoPath<
          PathParams,
          InferSchemaInput<RequestBodySchema>,
          InferSchemaInput<ResponseBodySchema>
        >
      : MockWithImplementationParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestBodySchema>,
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
      http[method](resolvedPath, async (requestInfo) => {
        // biome-ignore  lint/suspicious/noConsoleLog:
        console.log(requestInfo)
        return HttpResponse.json(await params.handleRequest(requestInfo), {
          status: params.responseCode,
        })
      }),
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
