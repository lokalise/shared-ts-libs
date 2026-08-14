import {
  type ApiContract,
  isBlobBody,
  isContentResponseEntry,
  isJsonBody,
  isSseBody,
  mapApiContractToPath,
} from '@lokalise/api-contracts'
import type { Mockttp, RequestRuleBuilder } from 'mockttp'
import type { z } from 'zod/v4'
import {
  formatSseResponse,
  type MockResponseParams,
  resolveContractEntry,
  resolveExplicitContentBody,
} from './types.ts'

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

export class ApiContractMockttpHelper {
  private readonly mockServer: Mockttp

  constructor(mockServer: Mockttp) {
    this.mockServer = mockServer
  }

  private resolveMethodBuilder(method: HttpMethod, path: string): RequestRuleBuilder {
    switch (method) {
      case 'get':
        return this.mockServer.forGet(path)
      case 'delete':
        return this.mockServer.forDelete(path)
      case 'post':
        return this.mockServer.forPost(path)
      case 'patch':
        return this.mockServer.forPatch(path)
      case 'put':
        return this.mockServer.forPut(path)
      default:
        throw new Error(`Unsupported method ${method}`)
    }
  }

  private resolvePath(contract: ApiContract, pathParams: unknown): string {
    return contract.requestPathParamsSchema && pathParams
      ? contract.pathResolver(pathParams)
      : mapApiContractToPath(contract)
  }

  async mockResponse<TContract extends ApiContract>(
    contract: TContract,
    params: MockResponseParams<TContract>,
  ): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: field access is safe — type is enforced by the public signature
    const anyParams = params as any
    const path = this.resolvePath(contract, params.pathParams)
    const statusCode = params.responseStatus
    const responseEntry = resolveContractEntry(contract.responsesByStatusCode, statusCode)

    if (!responseEntry) {
      throw new Error('Specified responseStatus cannot be mapped with contract')
    }

    const mockRule = this.resolveMethodBuilder(contract.method, path)

    if (isContentResponseEntry(responseEntry)) {
      // A no-body content entry (`{ allowNoBody: true }`) carries no `content`.
      if (!responseEntry.content) {
        await mockRule.thenReply(statusCode)
        return
      }

      // An explicit contentType pins the mock to that single content entry, skipping negotiation.
      if (anyParams.contentType) {
        const body = resolveExplicitContentBody(
          responseEntry.content,
          anyParams.contentType,
          anyParams,
        )
        await mockRule.thenReply(statusCode, body, { 'content-type': anyParams.contentType })
        return
      }

      const contentEntries = Object.entries(responseEntry.content)
      const jsonEntry = contentEntries.find((entry): entry is [string, z.ZodType] =>
        isJsonBody(entry[1]),
      )
      const sseEntry = contentEntries.find(([, descriptor]) => isSseBody(descriptor))
      const blobEntry = contentEntries.find(([, descriptor]) => isBlobBody(descriptor))

      await mockRule.thenCallback((request) => {
        const accept = request.headers.accept ?? ''

        // SSE wins only when the caller negotiates it via Accept.
        if (sseEntry && accept.includes('text/event-stream')) {
          return {
            statusCode,
            headers: { 'content-type': sseEntry[0] },
            body: formatSseResponse(anyParams.events),
          }
        }

        if (jsonEntry) {
          const body = jsonEntry[1].parse(anyParams.responseJson)
          return {
            statusCode,
            headers: { 'content-type': jsonEntry[0] },
            body: JSON.stringify(body),
          }
        }

        if (blobEntry) {
          return {
            statusCode,
            headers: { 'content-type': blobEntry[0] },
            body: anyParams.responseBlob,
          }
        }

        if (sseEntry) {
          return {
            statusCode,
            headers: { 'content-type': sseEntry[0] },
            body: formatSseResponse(anyParams.events),
          }
        }

        return { statusCode }
      })
      return
    }

    const body = responseEntry.parse(anyParams.responseJson)
    await mockRule.thenReply(statusCode, JSON.stringify(body), {
      'content-type': 'application/json',
    })
  }
}
