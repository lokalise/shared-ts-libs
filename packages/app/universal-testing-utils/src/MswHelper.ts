import {
  type CommonRouteDefinition,
  type InferSchemaInput,
  type InferSchemaOutput,
  mapRouteToPath,
  type PayloadRouteDefinition,
} from '@lokalise/api-contracts'
import {
  type DefaultBodyType,
  HttpResponse,
  type HttpResponseResolver,
  http,
  type JsonBodyType,
  type PathParams,
} from 'msw'
import type { SetupServerApi } from 'msw/node'
import type { ZodObject, z } from 'zod/v4'

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
    requestInfo: Parameters<HttpResponseResolver<Params, RequestBody, ResponseBody>>[0],
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

export type MockEndpointParams<
  ResponseBodySchema extends z.Schema<JsonBodyType>,
  PathParamsSchema extends z.Schema | undefined,
> = {
  server: SetupServerApi
  contract: CommonRouteDefinition<ResponseBodySchema, PathParamsSchema>
  pathParams: InferSchemaOutput<PathParamsSchema>
  // biome-ignore lint/suspicious/noExplicitAny: we accept any input
  responseBody: any
  responseCode: number
  validateResponse: boolean
}

export class MswHelper {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private resolveParams<
    ResponseBodySchema extends z.Schema<JsonBodyType>,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract: CommonRouteDefinition<ResponseBodySchema, PathParamsSchema>,
    pathParams: InferSchemaOutput<PathParamsSchema>,
  ) {
    const path = contract.requestPathParamsSchema
      ? contract.pathResolver(pathParams)
      : mapRouteToPath(contract)

    const resolvedPath = joinURL(this.baseUrl, path)
    // @ts-expect-error
    const method: HttpMethod = contract.method

    return { method, resolvedPath }
  }

  private registerEndpointMock<
    ResponseBodySchema extends z.Schema<JsonBodyType>,
    PathParamsSchema extends z.Schema | undefined,
  >(params: MockEndpointParams<ResponseBodySchema, PathParamsSchema>) {
    const { method, resolvedPath } = this.resolveParams(params.contract, params.pathParams)
    params.server.use(
      http[method](resolvedPath, () => {
        const resolvedResponse = params.validateResponse
          ? params.contract.successResponseBodySchema.parse(params.responseBody)
          : params.responseBody
        return HttpResponse.json(resolvedResponse, {
          status: params.responseCode,
        })
      }),
    )
  }

  mockValidResponse<
    ResponseBodySchema extends z.Schema<JsonBodyType>,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract: CommonRouteDefinition<ResponseBodySchema, PathParamsSchema>,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockParamsNoPath<InferSchemaInput<ResponseBodySchema>>
      : MockParams<InferSchemaInput<PathParamsSchema>, InferSchemaInput<ResponseBodySchema>>,
  ): void {
    this.registerEndpointMock({
      responseBody: params.responseBody,
      contract,
      server,
      // @ts-expect-error this is safe
      pathParams: params.pathParams,
      responseCode: params.responseCode ?? 200,
      validateResponse: true,
    })
  }

  mockValidResponseWithAnyPath<
    ResponseBodySchema extends z.Schema<JsonBodyType>,
    PathParamsSchema extends z.Schema | undefined,
  >(
    contract: CommonRouteDefinition<ResponseBodySchema, PathParamsSchema>,
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

    this.registerEndpointMock({
      responseBody: params.responseBody,
      contract,
      server,
      // @ts-expect-error this is safe
      pathParams,
      responseCode: params.responseCode ?? 200,
      validateResponse: true,
    })
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
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          RequestHeaderSchema,
          IsNonJSONResponseExpected,
          IsEmptyResponseExpected
        >
      | PayloadRouteDefinition<RequestBodySchema>,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockWithImplementationParamsNoPath<
          PathParams,
          // @ts-expect-error fixme, after v4 migration
          InferSchemaInput<RequestBodySchema>,
          InferSchemaInput<ResponseBodySchema>
        >
      : MockWithImplementationParams<
          // @ts-expect-error fixme, after v4 migration
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestBodySchema>,
          InferSchemaInput<ResponseBodySchema>
        >,
  ): void {
    // @ts-expect-error this is safe

    const { method, resolvedPath } = this.resolveParams(contract, params.pathParams)

    server.use(
      http[method](resolvedPath, async (requestInfo) => {
        return HttpResponse.json(
          // @ts-expect-error fixme, after v4 migration
          await params.handleRequest(
            // @ts-expect-error fixme, after v4 migration
            requestInfo as Parameters<
              HttpResponseResolver<
                // @ts-expect-error fixme, after v4 migration
                InferSchemaInput<PathParamsSchema>,
                InferSchemaInput<RequestBodySchema>,
                InferSchemaInput<ResponseBodySchema>
              >
            >[0],
          ),
          {
            status: params.responseCode,
          },
        )
      }),
    )
  }

  mockAnyResponse<PathParamsSchema extends z.Schema | undefined>(
    contract: CommonRouteDefinition<
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
    this.registerEndpointMock({
      responseBody: params.responseBody,
      contract,
      server,
      // @ts-expect-error this is safe
      pathParams: params.pathParams,
      responseCode: params.responseCode ?? 200,
      validateResponse: false,
    })
  }
}
