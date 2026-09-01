import {
  type ApiContract,
  type HttpStatusCode,
  isBlobBody,
  isContentResponseEntry,
  isJsonBody,
  isSseBody,
  mapApiContractToPath,
} from '@lokalise/api-contracts'
import type { CompletedRequest, Mockttp, RequestRuleBuilder } from 'mockttp'
import type { z } from 'zod/v4'
import {
  type MockResponseWrapper,
  unwrapMockResponse,
  wrapMockResponse,
} from '../responseWrapper.ts'
import {
  formatSseResponse,
  type MockImplementationParams,
  type MockResponseParams,
  resolveContractEntry,
  resolveExplicitContentBody,
  resolveJsonSchema,
} from './types.ts'

type HttpMethod = 'get' | 'delete' | 'post' | 'patch' | 'put'

export class ApiContractMockttpHelper {
  private readonly mockServer: Mockttp

  constructor(mockServer: Mockttp) {
    this.mockServer = mockServer
  }

  /**
   * Wraps a body returned from `handleRequest` so it carries its own status code, overriding
   * the mock's `responseStatus` for that call.
   */
  static response<T>(body: T, options?: { status?: number }): MockResponseWrapper<T> {
    return wrapMockResponse(body, options)
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

  /**
   * Mocks a JSON response whose body is computed from the incoming request.
   *
   * `responseStatus` picks the contract entry that types `handleRequest`'s return value. Return a
   * bare body to reply with that status, or wrap it with {@link ApiContractMockttpHelper.response}
   * to override the status for a single call.
   */
  async mockResponseWithImplementation<TContract extends ApiContract>(
    contract: TContract,
    params: MockImplementationParams<TContract, CompletedRequest>,
  ): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: field access is safe, the public signature enforces the type
    const anyParams = params as any
    const path = this.resolvePath(contract, params.pathParams)
    const statusCode = anyParams.responseStatus as HttpStatusCode
    const responseEntry = resolveContractEntry(contract.responsesByStatusCode, statusCode)

    if (!responseEntry) {
      throw new Error('Specified responseStatus cannot be mapped with contract')
    }

    const jsonSchema = resolveJsonSchema(responseEntry)
    if (!jsonSchema) {
      throw new Error(
        'Specified responseStatus has no JSON response body; use mockResponse for SSE and blob responses',
      )
    }

    await this.resolveMethodBuilder(contract.method, path).thenCallback(async (request) => {
      const result = await anyParams.handleRequest(request)
      const { body, status } = unwrapMockResponse(result)

      return {
        statusCode: status ?? statusCode,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(jsonSchema.parse(body)),
      }
    })
  }
}
