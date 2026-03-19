// biome-ignore-all lint/suspicious/noExplicitAny: expected here
import {
  type CommonRouteDefinition,
  type DualModeContractDefinition,
  type InferSchemaInput,
  type InferSchemaOutput,
  mapRouteToPath,
  type PayloadRouteDefinition,
  type SSEContractDefinition,
  type SSEEventSchemas,
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
import { formatSseResponse, type SseMockEvent } from './MockttpHelper.ts'

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

export type MswSseMockParams<PathParams, QueryParams, Events extends SSEEventSchemas> = {
  pathParams: PathParams
  responseCode?: number
  events: SseMockEvent<Events>[]
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

export type MswSseMockParamsNoPath<QueryParams, Events extends SSEEventSchemas> = {
  responseCode?: number
  events: SseMockEvent<Events>[]
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

export type MswDualModeMockParams<
  PathParams,
  QueryParams,
  ResponseBody,
  Events extends SSEEventSchemas,
> = {
  pathParams: PathParams
  responseCode?: number
  responseBody: ResponseBody
  events: SseMockEvent<Events>[]
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

export type MswDualModeMockParamsNoPath<
  QueryParams,
  ResponseBody,
  Events extends SSEEventSchemas,
> = {
  responseCode?: number
  responseBody: ResponseBody
  events: SseMockEvent<Events>[]
} & (QueryParams extends undefined ? { queryParams?: undefined } : { queryParams?: QueryParams })

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'
type SseHttpMethod = 'get' | 'post' | 'patch' | 'put'

function joinURL(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export type MockEndpointParams<PathParamsSchema extends z.Schema | undefined> = {
  server: SetupServerApi
  contract:
    | CommonRouteDefinition<any, PathParamsSchema, any, any, any, any, any, any>
    | PayloadRouteDefinition<any, any, PathParamsSchema, any, any, any, any, any, any>
  pathParams: InferSchemaOutput<PathParamsSchema>
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
      | CommonRouteDefinition<any, PathParamsSchema, any, any, any, any, any, any>
      | PayloadRouteDefinition<any, any, PathParamsSchema, any, any, any, any, any, any>,
    pathParams: InferSchemaOutput<PathParamsSchema>,
  ) {
    const path = contract.requestPathParamsSchema
      ? contract.pathResolver(pathParams)
      : mapRouteToPath(contract)

    const resolvedPath = joinURL(this.baseUrl, path)
    const method = ('method' in contract ? contract.method : 'get') as HttpMethod

    return { method, resolvedPath }
  }

  private registerEndpointMock<PathParamsSchema extends z.Schema | undefined>(
    params: MockEndpointParams<PathParamsSchema>,
  ) {
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

  private resolveStreamingPath(
    contract: any,
    pathParams: any,
  ): { resolvedPath: string; method: SseHttpMethod } {
    const path = contract.requestPathParamsSchema
      ? contract.pathResolver(pathParams)
      : contract.pathResolver({} as any)

    return {
      resolvedPath: joinURL(this.baseUrl, path),
      method: contract.method as SseHttpMethod,
    }
  }

  private static matchesQueryParams(
    request: Request,
    queryParams: Record<string, unknown> | undefined,
  ): boolean {
    if (!queryParams) return true
    const url = new URL(request.url)
    for (const [key, value] of Object.entries(queryParams)) {
      if (url.searchParams.get(key) !== String(value)) return false
    }
    return true
  }

  // Overload: Dual-mode contract — requires both responseBody and events
  mockValidResponse<
    ResponseBodySchema extends z.Schema<JsonBodyType>,
    Events extends SSEEventSchemas,
    PathParamsSchema extends z.Schema | undefined = undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract: DualModeContractDefinition<
      any,
      PathParamsSchema,
      RequestQuerySchema,
      any,
      any,
      ResponseBodySchema,
      Events,
      any,
      any
    >,
    server: SetupServerApi,
    params: PathParamsSchema extends z.Schema
      ? MswDualModeMockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestQuerySchema>,
          InferSchemaInput<ResponseBodySchema>,
          Events
        >
      : MswDualModeMockParamsNoPath<
          InferSchemaInput<RequestQuerySchema>,
          InferSchemaInput<ResponseBodySchema>,
          Events
        >,
  ): void

  // Overload: SSE contract — requires events, no responseBody
  mockValidResponse<
    Events extends SSEEventSchemas,
    PathParamsSchema extends z.Schema | undefined = undefined,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract: SSEContractDefinition<
      any,
      PathParamsSchema,
      RequestQuerySchema,
      any,
      any,
      Events,
      any
    >,
    server: SetupServerApi,
    params: PathParamsSchema extends z.Schema
      ? MswSseMockParams<
          InferSchemaInput<PathParamsSchema>,
          InferSchemaInput<RequestQuerySchema>,
          Events
        >
      : MswSseMockParamsNoPath<InferSchemaInput<RequestQuerySchema>, Events>,
  ): void

  // Overload: REST contract — requires responseBody, no events
  mockValidResponse<
    ResponseBodySchema extends z.Schema<JsonBodyType>,
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
          any
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
          any
        >,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockParamsNoPath<InferSchemaInput<ResponseBodySchema>>
      : MockParams<InferSchemaInput<PathParamsSchema>, InferSchemaInput<ResponseBodySchema>>,
  ): void

  // Implementation
  mockValidResponse(contract: any, server: SetupServerApi, params: any): void {
    if ('isDualMode' in contract && contract.isDualMode) {
      const { resolvedPath, method } = this.resolveStreamingPath(contract, params.pathParams)
      const sseBody = formatSseResponse(params.events)
      const jsonBody = contract.successResponseBodySchema.parse(params.responseBody)

      server.use(
        http[method](resolvedPath, ({ request }) => {
          if (!MswHelper.matchesQueryParams(request, params.queryParams)) return

          const accept = request.headers.get('accept') ?? ''
          if (accept.includes('text/event-stream')) {
            return new HttpResponse(sseBody, {
              status: params.responseCode ?? 200,
              headers: { 'content-type': 'text/event-stream' },
            })
          }

          return HttpResponse.json(jsonBody, { status: params.responseCode ?? 200 })
        }),
      )
    } else if ('isSSE' in contract && contract.isSSE) {
      const { resolvedPath, method } = this.resolveStreamingPath(contract, params.pathParams)
      const body = formatSseResponse(params.events)

      server.use(
        http[method](resolvedPath, ({ request }) => {
          if (!MswHelper.matchesQueryParams(request, params.queryParams)) return

          return new HttpResponse(body, {
            status: params.responseCode ?? 200,
            headers: { 'content-type': 'text/event-stream' },
          })
        }),
      )
    } else {
      this.registerEndpointMock({
        responseBody: params.responseBody,
        contract,
        server,
        pathParams: params.pathParams,
        responseCode: params.responseCode ?? 200,
        validateResponse: true,
      })
    }
  }

  // Overload: Dual-mode contract
  mockValidResponseWithAnyPath<
    ResponseBodySchema extends z.Schema<JsonBodyType>,
    Events extends SSEEventSchemas,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract: DualModeContractDefinition<
      any,
      z.Schema | undefined,
      RequestQuerySchema,
      any,
      any,
      ResponseBodySchema,
      Events,
      any,
      any
    >,
    server: SetupServerApi,
    params: MswDualModeMockParamsNoPath<
      InferSchemaInput<RequestQuerySchema>,
      InferSchemaInput<ResponseBodySchema>,
      Events
    >,
  ): void

  // Overload: SSE contract
  mockValidResponseWithAnyPath<
    Events extends SSEEventSchemas,
    RequestQuerySchema extends z.Schema | undefined = undefined,
  >(
    contract: SSEContractDefinition<
      any,
      z.Schema | undefined,
      RequestQuerySchema,
      any,
      any,
      Events,
      any
    >,
    server: SetupServerApi,
    params: MswSseMockParamsNoPath<InferSchemaInput<RequestQuerySchema>, Events>,
  ): void

  // Overload: REST contract
  mockValidResponseWithAnyPath<ResponseBodySchema extends z.Schema<JsonBodyType>>(
    contract:
      | CommonRouteDefinition<
          ResponseBodySchema,
          z.Schema | undefined,
          z.Schema | undefined,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any
        >
      | PayloadRouteDefinition<
          z.Schema | undefined,
          ResponseBodySchema,
          z.Schema | undefined,
          z.Schema | undefined,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any
        >,
    server: SetupServerApi,
    params: MockParamsNoPath<InferSchemaInput<ResponseBodySchema>>,
  ): void

  // Implementation
  mockValidResponseWithAnyPath(contract: any, server: SetupServerApi, params: any): void {
    const pathParams = contract.requestPathParamsSchema
      ? Object.keys((contract.requestPathParamsSchema as ZodObject<any>).shape).reduce(
          (acc, value) => {
            acc[value] = '*'
            return acc
          },
          {} as Record<string, string>,
        )
      : {}

    this.mockValidResponse(contract, server, { ...params, pathParams })
  }

  mockValidResponseWithImplementation<
    ResponseBodySchema extends z.Schema,
    PathParamsSchema extends z.Schema | undefined,
    RequestBodySchema extends z.Schema | undefined = undefined,
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
          any
        >
      | PayloadRouteDefinition<
          RequestBodySchema,
          ResponseBodySchema,
          PathParamsSchema,
          z.Schema | undefined,
          z.Schema | undefined,
          z.Schema | undefined,
          boolean,
          boolean,
          any
        >,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockWithImplementationParamsNoPath<any, any, any>
      : MockWithImplementationParams<any, any, any>,
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

  mockAnyResponse<PathParamsSchema extends z.Schema | undefined>(
    contract:
      | CommonRouteDefinition<any, PathParamsSchema, any, any, any, any, any, any>
      | PayloadRouteDefinition<any, any, PathParamsSchema, any, any, any, any, any, any>,
    server: SetupServerApi,
    params: PathParamsSchema extends undefined
      ? MockParamsNoPath<InferSchemaInput<any>>
      : MockParams<InferSchemaInput<PathParamsSchema>, InferSchemaInput<any>>,
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
