import {
  type ApiContract,
  ContractNoBody,
  isAnyOfResponses,
  isBlobResponse,
  isSseResponse,
  isTextResponse,
  mapApiContractToPath,
} from '@lokalise/api-contracts'
import type { Mockttp, RequestRuleBuilder } from 'mockttp'
import { formatSseResponse, type MockResponseParams } from './types.ts'

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
    const responseEntry = contract.responsesByStatusCode[params.responseStatus]

    if (!responseEntry) {
      throw new Error('Specified responseStatus cannot be mapped with contract')
    }

    const mockRule = this.resolveMethodBuilder(contract.method, path)

    if (responseEntry === ContractNoBody) {
      await mockRule.thenReply(statusCode)
      return
    }

    if (isTextResponse(responseEntry)) {
      await mockRule.thenReply(statusCode, anyParams.responseText, {
        'content-type': responseEntry.contentType,
      })
      return
    }

    if (isBlobResponse(responseEntry)) {
      await mockRule.thenReply(statusCode, anyParams.responseBlob, {
        'content-type': responseEntry.contentType,
      })
      return
    }

    if (isSseResponse(responseEntry)) {
      const body = formatSseResponse(anyParams.events)
      await mockRule.thenCallback(() => ({
        statusCode,
        headers: { 'content-type': 'text/event-stream' },
        body,
      }))
      return
    }

    if (isAnyOfResponses(responseEntry)) {
      const sseEntry = responseEntry.responses.find(isSseResponse)
      const jsonEntry = responseEntry.responses.find(
        (entry) => !isSseResponse(entry) && !isTextResponse(entry) && !isBlobResponse(entry),
      )

      await mockRule.thenCallback((request) => {
        const accept = request.headers.accept ?? ''

        if (accept.includes('text/event-stream') && sseEntry) {
          const body = formatSseResponse(anyParams.events)
          return { statusCode, headers: { 'content-type': 'text/event-stream' }, body }
        }

        if (jsonEntry) {
          const body = JSON.stringify(anyParams.responseJson)
          return { statusCode, headers: { 'content-type': 'application/json' }, body }
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
