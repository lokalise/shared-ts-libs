import {
  type ApiContract,
  type ApiContractResponse,
  ContractNoBody, type HttpStatusCode,
  isAnyOfResponses,
  isBlobResponse,
  isJsonResponse,
  isNoBodyResponse,
  isSseResponse,
  isTextResponse,
  mapApiContractToPath,
  type ResponsesByStatusCode,
} from '@lokalise/api-contracts'
import type { Mockttp, RequestRuleBuilder } from 'mockttp'
import { formatSseResponse, type MockResponseParams } from './types.ts'

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

function getRangeKey(statusCode: HttpStatusCode) {
  if (statusCode >= 100 && statusCode < 200) return '1xx'
  if (statusCode >= 200 && statusCode < 300) return '2xx'
  if (statusCode >= 300 && statusCode < 400) return '3xx'
  if (statusCode >= 400 && statusCode < 500) return '4xx'
  if (statusCode >= 500 && statusCode < 600) return '5xx'
}

function resolveContractEntry(responsesByStatusCode: ResponsesByStatusCode, statusCode: HttpStatusCode): ApiContractResponse | undefined {
  const rangeKey = getRangeKey(statusCode)

  return responsesByStatusCode[statusCode] ?? (rangeKey ? responsesByStatusCode[rangeKey] : undefined) ?? responsesByStatusCode['default']
}

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

    if (responseEntry === ContractNoBody || isNoBodyResponse(responseEntry)) {
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
      const jsonEntry = responseEntry.responses.find(isJsonResponse)

      await mockRule.thenCallback((request) => {
        const accept = request.headers.accept ?? ''

        if (accept.includes('text/event-stream') && sseEntry) {
          const body = formatSseResponse(anyParams.events)
          return { statusCode, headers: { 'content-type': 'text/event-stream' }, body }
        }

        if (jsonEntry) {
          const body = jsonEntry.parse(anyParams.responseJson)
          return {
            statusCode,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
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
