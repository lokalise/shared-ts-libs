import {
  type ApiContract,
  isBlobBody,
  isContentResponseEntry,
  isJsonBody,
  isSseBody,
  mapApiContractToPath,
} from '@lokalise/api-contracts'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import type { SetupServer } from 'msw/node'
import type { z } from 'zod/v4'
import {
  formatSseResponse,
  type MockResponseParams,
  resolveContractEntry,
  resolveExplicitContentBody,
} from './types.ts'

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

function joinURL(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export class ApiContractMswHelper {
  private readonly server: SetupServer
  private readonly baseUrl: string

  constructor(server: SetupServer, baseUrl: string) {
    this.server = server
    this.baseUrl = baseUrl
  }

  private resolvePath(contract: ApiContract, pathParams: unknown): string {
    const path =
      contract.requestPathParamsSchema && pathParams
        ? contract.pathResolver(pathParams)
        : mapApiContractToPath(contract)

    return joinURL(this.baseUrl, path)
  }

  mockResponse<TContract extends ApiContract>(
    contract: TContract,
    params: MockResponseParams<TContract>,
  ): void {
    // biome-ignore lint/suspicious/noExplicitAny: field access is safe — type is enforced by the public signature
    const anyParams = params as any
    const path = this.resolvePath(contract, params.pathParams)
    const statusCode = params.responseStatus
    const responseEntry = resolveContractEntry(contract.responsesByStatusCode, statusCode)

    if (!responseEntry) {
      throw new Error('Specified responseStatus cannot be mapped with contract')
    }

    const method = contract.method as HttpMethod

    if (isContentResponseEntry(responseEntry)) {
      // A no-body content entry (`{ allowNoBody: true }`) carries no `content`.
      if (!responseEntry.content) {
        this.server.use(http[method](path, () => new HttpResponse(null, { status: statusCode })))
        return
      }

      // An explicit contentType pins the mock to that single content entry, skipping negotiation.
      if (anyParams.contentType) {
        const body = resolveExplicitContentBody(
          responseEntry.content,
          anyParams.contentType,
          anyParams,
        )
        this.server.use(
          http[method](
            path,
            () =>
              new HttpResponse(body, {
                status: statusCode,
                headers: { 'content-type': anyParams.contentType },
              }),
          ),
        )
        return
      }

      const contentEntries = Object.entries(responseEntry.content)
      const jsonEntry = contentEntries.find((entry): entry is [string, z.ZodType] =>
        isJsonBody(entry[1]),
      )
      const sseEntry = contentEntries.find(([, descriptor]) => isSseBody(descriptor))
      const blobEntry = contentEntries.find(([, descriptor]) => isBlobBody(descriptor))

      this.server.use(
        http[method](path, ({ request }) => {
          const accept = request.headers.get('accept') ?? ''

          // SSE wins only when the caller negotiates it via Accept.
          if (sseEntry && accept.includes('text/event-stream')) {
            return new HttpResponse(formatSseResponse(anyParams.events), {
              status: statusCode,
              headers: { 'content-type': sseEntry[0] },
            })
          }

          if (jsonEntry) {
            const body = jsonEntry[1].parse(anyParams.responseJson) as JsonBodyType
            return HttpResponse.json(body, {
              status: statusCode,
              headers: { 'content-type': jsonEntry[0] },
            })
          }

          if (blobEntry) {
            return new HttpResponse(anyParams.responseBlob, {
              status: statusCode,
              headers: { 'content-type': blobEntry[0] },
            })
          }

          if (sseEntry) {
            return new HttpResponse(formatSseResponse(anyParams.events), {
              status: statusCode,
              headers: { 'content-type': sseEntry[0] },
            })
          }

          return new HttpResponse(null, { status: statusCode })
        }),
      )
      return
    }

    const body = responseEntry.parse(anyParams.responseJson) as JsonBodyType
    this.server.use(http[method](path, () => HttpResponse.json(body, { status: statusCode })))
  }
}
