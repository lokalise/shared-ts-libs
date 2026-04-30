// biome-ignore-all lint/suspicious/noExplicitAny: Expected for mocking

import type { SseSchemaByEventName } from '@lokalise/api-contracts'
import {
  type ApiContract,
  ContractNoBody,
  type InferSchemaInput,
  isAnyOfResponses,
  isBlobResponse,
  isSseResponse,
  isTextResponse,
  mapApiContractToPath,
} from '@lokalise/api-contracts'
import {
  type DefaultBodyType,
  HttpResponse,
  type HttpResponseResolver,
  http,
  type PathParams,
} from 'msw'
import type { SetupServer } from 'msw/node'
import type { ZodObject } from 'zod/v4'
import { formatSseResponse, type MockResponseParams, type SseMockEventInput } from './types.ts'

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

const RESPONSE_BRAND = Symbol('ApiContractMswHelperResponse')

export type MockResponseWrapper<T> = {
  readonly [RESPONSE_BRAND]: true
  readonly body: T
  readonly status?: number
}

export type MockWithImplementationParamsNoPath<
  Params extends PathParams<keyof Params>,
  RequestBody extends DefaultBodyType,
  ResponseBody extends DefaultBodyType,
> = {
  handleRequest: (
    requestInfo: Parameters<HttpResponseResolver<Params, RequestBody, ResponseBody>>[0],
  ) =>
    | ResponseBody
    | MockResponseWrapper<ResponseBody>
    | Promise<ResponseBody | MockResponseWrapper<ResponseBody>>
  statusCode?: number
}

export type SseEventController<Events extends SseSchemaByEventName> = {
  emit(event: SseMockEventInput<Events>): void
  close(): void
}

function joinURL(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export class ApiContractMswHelper {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  static response<T>(body: T, options?: { status?: number }): MockResponseWrapper<T> {
    return { [RESPONSE_BRAND]: true, body, status: options?.status }
  }

  private static unwrapResponse(result: any): { body: any; status?: number } {
    if (result && typeof result === 'object' && RESPONSE_BRAND in result) {
      return { body: result.body, status: result.status }
    }
    return { body: result }
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

  private resolvePath(contract: ApiContract, pathParams: any): string {
    return contract.requestPathParamsSchema && pathParams
      ? contract.pathResolver(pathParams)
      : mapApiContractToPath(contract)
  }

  private resolvedUrl(contract: ApiContract, pathParams: any): string {
    return joinURL(this.baseUrl, this.resolvePath(contract, pathParams))
  }

  mockResponse<TContract extends ApiContract>(
    contract: TContract,
    server: SetupServer,
    params: MockResponseParams<TContract>,
  ): void {
    this.mockInternal(contract, server, params)
  }

  private mockInternal(contract: ApiContract, server: SetupServer, params: any): void {
    const method = contract.method as HttpMethod
    const resolvedPath = this.resolvedUrl(contract, params.pathParams)
    const statusCode: number = params.responseStatus ?? 200
    const responseEntry =
      contract.responsesByStatusCode[statusCode as keyof typeof contract.responsesByStatusCode]

    server.use(
      http[method](resolvedPath, ({ request }) => {
        if (!ApiContractMswHelper.matchesQueryParams(request, params.queryParams)) return

        if (responseEntry === ContractNoBody || responseEntry === undefined) {
          return new HttpResponse(null, { status: statusCode })
        }

        if (isAnyOfResponses(responseEntry)) {
          const sseEntry = responseEntry.responses.find(isSseResponse)
          const jsonEntry = responseEntry.responses.find(
            (r): r is any => !isSseResponse(r) && !isTextResponse(r) && !isBlobResponse(r),
          )
          const accept = request.headers.get('accept') ?? ''

          if (accept.includes('text/event-stream') && sseEntry) {
            const sseBody = formatSseResponse(
              (params.events as { event: string; data: unknown }[] | undefined) ?? [],
            )
            return new HttpResponse(sseBody, {
              status: statusCode,
              headers: { 'content-type': 'text/event-stream' },
            })
          }

          if (jsonEntry) {
            return HttpResponse.json(jsonEntry.parse(params.responseBody), { status: statusCode })
          }

          return new HttpResponse(null, { status: statusCode })
        }

        if (isSseResponse(responseEntry)) {
          const sseBody = formatSseResponse(
            (params.events as { event: string; data: unknown }[]) ?? [],
          )
          return new HttpResponse(sseBody, {
            status: statusCode,
            headers: { 'content-type': 'text/event-stream' },
          })
        }

        if (isTextResponse(responseEntry)) {
          return new HttpResponse(params.responseText as string, {
            status: statusCode,
            headers: { 'content-type': responseEntry.contentType },
          })
        }

        // JSON (ZodType)
        const body = (responseEntry as any).parse(params.responseBody)
        return HttpResponse.json(body, { status: statusCode })
      }),
    )
  }

  mockResponseWithAnyPath<TContract extends ApiContract>(
    contract: TContract,
    server: SetupServer,
    params: Omit<MockResponseParams<TContract>, 'pathParams'>,
  ): void {
    const pathParams = contract.requestPathParamsSchema
      ? Object.keys((contract.requestPathParamsSchema as ZodObject<any>).shape).reduce(
          (acc, key) => {
            acc[key] = '*'
            return acc
          },
          {} as Record<string, string>,
        )
      : {}
    this.mockResponse(contract, server, { ...params, pathParams } as any)
  }

  mockResponseWithImplementation<TContract extends ApiContract>(
    contract: TContract,
    server: SetupServer,
    params: (InferSchemaInput<TContract['requestPathParamsSchema']> extends undefined
      ? MockWithImplementationParamsNoPath<any, any, any>
      : MockWithImplementationParamsNoPath<any, any, any> & {
          pathParams: InferSchemaInput<TContract['requestPathParamsSchema']>
        }) & {
      queryParams?: InferSchemaInput<TContract['requestQuerySchema']>
    },
  ): void {
    const method = contract.method as HttpMethod
    const resolvedPath = this.resolvedUrl(contract, (params as any).pathParams)

    server.use(
      http[method](resolvedPath, async (requestInfo) => {
        if (
          !ApiContractMswHelper.matchesQueryParams(requestInfo.request, (params as any).queryParams)
        )
          return
        const result = await (params as any).handleRequest(requestInfo)
        const { body, status } = ApiContractMswHelper.unwrapResponse(result)
        return HttpResponse.json(body, { status: status ?? (params as any).statusCode ?? 200 })
      }),
    )
  }

  mockSseStream<TContract extends ApiContract>(
    contract: TContract,
    server: SetupServer,
    params?: (InferSchemaInput<TContract['requestPathParamsSchema']> extends undefined
      ? { pathParams?: never }
      : { pathParams: InferSchemaInput<TContract['requestPathParamsSchema']> }) & {
      queryParams?: InferSchemaInput<TContract['requestQuerySchema']>
      statusCode?: number
    },
  ): SseEventController<any> {
    const method = contract.method as HttpMethod
    const resolvedPath = this.resolvedUrl(contract, (params as any)?.pathParams)
    const statusCode: number = (params as any)?.statusCode ?? 200
    const responseEntry =
      contract.responsesByStatusCode[statusCode as keyof typeof contract.responsesByStatusCode]
    const isDualMode = responseEntry !== undefined && isAnyOfResponses(responseEntry)
    const encoder = new TextEncoder()

    let streamController: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })

    server.use(
      http[method](resolvedPath, ({ request }) => {
        if (!ApiContractMswHelper.matchesQueryParams(request, (params as any)?.queryParams)) return

        if (isDualMode) {
          const accept = request.headers.get('accept') ?? ''
          if (!accept.includes('text/event-stream')) {
            // dual-mode non-streaming: return empty JSON — caller is expected to use mockResponse for that case
            return HttpResponse.json({}, { status: statusCode })
          }
        }

        return new HttpResponse(stream, {
          status: statusCode,
          headers: { 'content-type': 'text/event-stream' },
        })
      }),
    )

    return {
      emit(event: { event: string; data: unknown }) {
        const chunk = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
        streamController.enqueue(encoder.encode(chunk))
      },
      close() {
        streamController.close()
      },
    }
  }
}
