// biome-ignore-all lint/suspicious/noExplicitAny: expected here
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

export type CommonMockParams<QueryParams, HeaderParams> = {
  responseCode?: number
  headerParams?: HeaderParams
  queryParams?: QueryParams
}

export type MockParams<PathParams, ResponseBody, QueryParams, HeaderParams> = {
  pathParams: PathParams
  responseBody: ResponseBody
} & CommonMockParams<QueryParams, HeaderParams>

export type MockParamsNoPath<ResponseBody, QueryParams, HeaderParams> = {
  responseBody: ResponseBody
} & CommonMockParams<QueryParams, HeaderParams>

export type MockWithImplementationParamsNoPath<
  Params extends PathParams<keyof Params>,
  RequestBody extends DefaultBodyType,
  ResponseBody extends DefaultBodyType,
  QueryParams,
  HeaderParams,
> = {
  handleRequest: (
    requestInfo: Parameters<HttpResponseResolver<Params, RequestBody, ResponseBody>>[0],
  ) => ResponseBody | Promise<ResponseBody>
} & CommonMockParams<QueryParams, HeaderParams>

export type MockWithImplementationParams<
  Params extends PathParams<keyof Params>,
  RequestBody extends DefaultBodyType,
  ResponseBody extends DefaultBodyType,
  QueryParams,
  HeaderParams,
> = {
  pathParams: Params
} & MockWithImplementationParamsNoPath<Params, RequestBody, ResponseBody, QueryParams, HeaderParams>

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

function joinURL(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export type MockEndpointParams<
  PathParamsSchema extends z.Schema | undefined,
  QueryParamsSchema extends z.Schema | undefined,
  HeaderParamsSchema extends z.Schema | undefined,
> = {
  server: SetupServerApi
  contract:
    | CommonRouteDefinition<
        any,
        PathParamsSchema,
        QueryParamsSchema,
        HeaderParamsSchema,
        any,
        any,
        any
      >
    | PayloadRouteDefinition<
        any,
        any,
        PathParamsSchema,
        QueryParamsSchema,
        HeaderParamsSchema,
        any,
        any,
        any
      >
  pathParams: InferSchemaOutput<PathParamsSchema>
  headerParams: InferSchemaOutput<HeaderParamsSchema>
  requestQueryParams: InferSchemaOutput<QueryParamsSchema>
  responseBody: any
  responseCode: number
  validateResponse: boolean
}

export class MswHelper {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private resolveParams<PathParamsSchema extends z.Schema | undefined>(
    contract:
      | CommonRouteDefinition<any, PathParamsSchema, any, any, any, any, any>
      | PayloadRouteDefinition<any, any, PathParamsSchema, any, any, any, any, any>,
    pathParams: InferSchemaOutput<PathParamsSchema>,
  ) {
    const path = contract.requestPathParamsSchema
      ? contract.pathResolver(pathParams)
      : mapRouteToPath(contract)

    const resolvedPath = joinURL(this.baseUrl, path)
    const method = ('method' in contract ? contract.method : 'get') as HttpMethod

    return { method, resolvedPath }
  }

  private registerEndpointMock<
    PathParamsSchema extends z.Schema | undefined,
    RequestQuery extends z.Schema | undefined,
    RequestHeader extends z.Schema | undefined,
  >(params: MockEndpointParams<PathParamsSchema, RequestQuery, RequestHeader>) {
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
    RequestQuerySchema extends z.Schema | undefined,
    RequestHeaderSchema extends z.Schema | undefined,
  >(
    contract:
      | CommonRouteDefinition<
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          RequestHeaderSchema,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >
      | PayloadRouteDefinition<
          z.Schema | undefined,
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          RequestHeaderSchema,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockParamsNoPath<
          InferSchemaInput<ResponseBodySchema>,
          InferSchemaOutput<RequestQuerySchema>,
          InferSchemaOutput<RequestHeaderSchema>
        >
      : MockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<ResponseBodySchema>,
          InferSchemaOutput<RequestQuerySchema>,
          InferSchemaOutput<RequestHeaderSchema>
        >,
  ): void {
    this.registerEndpointMock({
      responseBody: params.responseBody,
      contract,
      server,
      // @ts-expect-error this is safe
      pathParams: params.pathParams,
      responseCode: params.responseCode ?? 200,
      // biome-ignore lint/style/noNonNullAssertion: this is needed
      headerParams: params.headerParams!,
      // biome-ignore lint/style/noNonNullAssertion: this is needed
      requestQueryParams: params.queryParams!,
      validateResponse: true,
    })
  }

  mockValidResponseWithAnyPath<
    ResponseBodySchema extends z.Schema<JsonBodyType>,
    RequestQuerySchema extends z.Schema | undefined,
    RequestHeaderSchema extends z.Schema | undefined,
  >(
    contract:
      | CommonRouteDefinition<
          ResponseBodySchema,
          z.Schema | undefined,
          RequestQuerySchema,
          RequestHeaderSchema,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >
      | PayloadRouteDefinition<
          z.Schema | undefined,
          ResponseBodySchema,
          z.Schema | undefined,
          RequestQuerySchema,
          RequestHeaderSchema,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >,
    server: SetupServerApi,
    params: MockParamsNoPath<
      InferSchemaInput<ResponseBodySchema>,
      InferSchemaOutput<RequestQuerySchema>,
      InferSchemaOutput<RequestHeaderSchema>
    >,
  ): void {
    const pathParams = contract.requestPathParamsSchema
      ? Object.keys((contract.requestPathParamsSchema as ZodObject<any>).shape).reduce(
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
      pathParams: pathParams as any,
      // biome-ignore lint/style/noNonNullAssertion: this is needed
      headerParams: params.headerParams!,
      // biome-ignore lint/style/noNonNullAssertion: this is needed
      requestQueryParams: params.queryParams!,
      responseCode: params.responseCode ?? 200,
      validateResponse: true,
    })
  }

  mockValidResponseWithImplementation<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
    RequestQuerySchema extends z.Schema | undefined,
    RequestHeaderSchema extends z.Schema | undefined,
    RequestBodySchema extends z.Schema | undefined = undefined,
  >(
    contract:
      | CommonRouteDefinition<
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          RequestHeaderSchema,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >
      | PayloadRouteDefinition<
          RequestBodySchema,
          ResponseBodySchema,
          PathParamsSchema,
          RequestQuerySchema,
          RequestHeaderSchema,
          boolean,
          boolean,
          any // ResponseSchemasByStatusCode - not used in mocking
        >,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockWithImplementationParamsNoPath<any, any, any, any, any>
      : MockWithImplementationParams<any, any, any, any, any>,
  ): void {
    // @ts-expect-error pathParams might not exist
    const { method, resolvedPath } = this.resolveParams(contract, params.pathParams)

    server.use(
      http[method](resolvedPath, async (requestInfo) => {
        return HttpResponse.json(await params.handleRequest(requestInfo), {
          status: params.responseCode,
        })
      }),
    )
  }

  mockAnyResponse<
    PathParamsSchema extends z.Schema | undefined,
    RequestQuerySchema extends z.Schema | undefined,
    RequestHeaderSchema extends z.Schema | undefined,
  >(
    contract:
      | CommonRouteDefinition<any, PathParamsSchema, any, any, any, any, any>
      | PayloadRouteDefinition<any, any, PathParamsSchema, any, any, any, any, any>,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockParamsNoPath<
          InferSchemaInput<any>,
          InferSchemaOutput<RequestQuerySchema>,
          InferSchemaOutput<RequestHeaderSchema>
        >
      : MockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<any>,
          InferSchemaOutput<RequestQuerySchema>,
          InferSchemaOutput<RequestHeaderSchema>
        >,
  ): void {
    this.registerEndpointMock({
      responseBody: params.responseBody,
      contract,
      server,
      // @ts-expect-error this is safe
      pathParams: params.pathParams,
      // biome-ignore lint/style/noNonNullAssertion: this is needed
      headerParams: params.headerParams!,
      // biome-ignore lint/style/noNonNullAssertion: this is needed
      requestQueryParams: params.queryParams!,
      responseCode: params.responseCode ?? 200,
      validateResponse: false,
    })
  }
}
