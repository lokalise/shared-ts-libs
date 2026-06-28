import { sendByApiContract } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch from 'wretch'
import {
  anyOfTextResponsesApiContract,
  blobContentApiContract,
  blobResponseApiContract,
  deleteApiContractWithNoBodyResponse,
  dualContentApiContract,
  dualModeApiContract,
  dualModeApiContractWithPathParams,
  getApiContract,
  getApiContractWith2xxRange,
  getApiContractWith4xxRange,
  getApiContractWith5xxRange,
  getApiContractWithDefault,
  getApiContractWithExactAndRange,
  getApiContractWithPathAndQueryParams,
  getApiContractWithPathParams,
  getApiContractWithQueryParams,
  jsonContentApiContract,
  noBodyApiContract,
  noBodyContentApiContract,
  patchApiContract,
  postApiContract,
  postApiContractWithPathParams,
  putApiContract,
  sseContentApiContract,
  sseGetApiContract,
  sseGetApiContractWithPathParams,
  sseGetApiContractWithQueryParams,
  textResponseApiContract,
} from '../../test/testApiContracts.ts'
import { ApiContractMockttpHelper } from './ApiContractMockttpHelper.ts'

describe('ApiContractMockttpHelper', () => {
  const mockServer = getLocal()
  const helper = new ApiContractMockttpHelper(mockServer)

  beforeEach(async () => {
    await mockServer.start()
  })
  afterEach(() => mockServer.stop())

  function client() {
    return wretch(mockServer.url)
  }

  describe('mockResponse — REST contracts', () => {
    it('mocks GET without path params', async () => {
      await helper.mockResponse(getApiContract, { responseStatus: 200, responseJson: { id: '1' } })
      const result = await sendByApiContract(client(), getApiContract, {})
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('enforces GET contract schema (strips unknown properties)', async () => {
      await helper.mockResponse(getApiContract, {
        responseStatus: 200,
        // @ts-expect-error wrong property on responseJson
        responseJson: { id: '1', wrong: 'x' },
      })
      const result = await sendByApiContract(client(), getApiContract, {})
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks GET with path params', async () => {
      await helper.mockResponse(getApiContractWithPathParams, {
        pathParams: { userId: '3' },
        responseStatus: 200,
        responseJson: { id: '3' },
      })
      const result = await sendByApiContract(client(), getApiContractWithPathParams, {
        pathParams: { userId: '3' },
      })
      expect(result.result?.body).toEqual({ id: '3' })
    })

    it('mocks GET with query params', async () => {
      await helper.mockResponse(getApiContractWithQueryParams, {
        responseStatus: 200,
        responseJson: { id: '1' },
      })
      const result = await sendByApiContract(client(), getApiContractWithQueryParams, {
        queryParams: { yearFrom: 2024 },
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks GET with path and query params', async () => {
      await helper.mockResponse(getApiContractWithPathAndQueryParams, {
        pathParams: { userId: '3' },
        responseStatus: 200,
        responseJson: { id: '3' },
      })
      const result = await sendByApiContract(client(), getApiContractWithPathAndQueryParams, {
        pathParams: { userId: '3' },
        queryParams: { yearFrom: 2024 },
      })
      expect(result.result?.body).toEqual({ id: '3' })
    })

    it('mocks POST without path params', async () => {
      await helper.mockResponse(postApiContract, { responseStatus: 200, responseJson: { id: '1' } })
      const result = await sendByApiContract(client(), postApiContract, { body: { name: 'test' } })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks POST with path params', async () => {
      await helper.mockResponse(postApiContractWithPathParams, {
        pathParams: { userId: '3' },
        responseStatus: 200,
        responseJson: { id: '2' },
      })
      const result = await sendByApiContract(client(), postApiContractWithPathParams, {
        pathParams: { userId: '3' },
        body: { name: 'test' },
      })
      expect(result.result?.body).toEqual({ id: '2' })
    })

    it('mocks no-body DELETE response (204)', async () => {
      await helper.mockResponse(noBodyApiContract, {
        pathParams: { userId: '1' },
        responseStatus: 204,
      })
      const result = await sendByApiContract(client(), noBodyApiContract, {
        pathParams: { userId: '1' },
      })
      expect(result.result?.body).toBeNull()
    })
  })

  describe('mockResponse — SSE contracts', () => {
    it('mocks SSE-only GET response', async () => {
      await helper.mockResponse(sseGetApiContract, {
        responseStatus: 200,
        events: [
          { event: 'item.updated', data: { items: [{ id: '1' }] } },
          { event: 'completed', data: { totalCount: 1 } },
        ],
      })
      const result = await sendByApiContract(client(), sseGetApiContract, {})
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(2)
    })

    it('mocks SSE with path params', async () => {
      await helper.mockResponse(sseGetApiContractWithPathParams, {
        pathParams: { userId: '5' },
        responseStatus: 200,
        events: [{ event: 'completed', data: { totalCount: 5 } }],
      })
      const result = await sendByApiContract(client(), sseGetApiContractWithPathParams, {
        pathParams: { userId: '5' },
      })
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })

    it('mocks SSE with query params', async () => {
      await helper.mockResponse(sseGetApiContractWithQueryParams, {
        responseStatus: 200,
        events: [{ event: 'completed', data: { totalCount: 3 } }],
      })
      const result = await sendByApiContract(client(), sseGetApiContractWithQueryParams, {
        queryParams: { yearFrom: 2024 },
      })
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })
  })

  describe('mockResponse — dual-mode contracts', () => {
    it('returns JSON when no SSE Accept header', async () => {
      await helper.mockResponse(dualModeApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract(client(), dualModeApiContract, {
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('returns SSE when Accept: text/event-stream', async () => {
      await helper.mockResponse(dualModeApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract<typeof dualModeApiContract, true>(
        client(),
        dualModeApiContract,
        {
          body: { name: 'test' },
          streaming: true,
        },
      )
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })

    it('mocks dual-mode with path params', async () => {
      await helper.mockResponse(dualModeApiContractWithPathParams, {
        pathParams: { userId: '2' },
        responseStatus: 200,
        responseJson: { id: '2' },
        events: [{ event: 'completed', data: { totalCount: 2 } }],
      })
      const result = await sendByApiContract(client(), dualModeApiContractWithPathParams, {
        pathParams: { userId: '2' },
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '2' })
    })
  })

  describe('mockResponse — content-map contracts', () => {
    it('mocks a JSON content entry', async () => {
      await helper.mockResponse(jsonContentApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
      })
      const result = await sendByApiContract(client(), jsonContentApiContract, {})
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks a blob content entry', async () => {
      await helper.mockResponse(blobContentApiContract, {
        responseStatus: 200,
        responseBlob: 'binary-data',
      })
      const result = await sendByApiContract(client(), blobContentApiContract, {})
      expect(await (result.result?.body as Blob).text()).toBe('binary-data')
    })

    it('mocks an SSE content entry', async () => {
      await helper.mockResponse(sseContentApiContract, {
        responseStatus: 200,
        events: [
          { event: 'item.updated', data: { items: [{ id: '1' }] } },
          { event: 'completed', data: { totalCount: 1 } },
        ],
      })
      const result = await sendByApiContract(client(), sseContentApiContract, {})
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(2)
    })

    it('returns JSON for a dual content entry when not streaming', async () => {
      await helper.mockResponse(dualContentApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract(client(), dualContentApiContract, {
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('returns SSE for a dual content entry when streaming', async () => {
      await helper.mockResponse(dualContentApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract<typeof dualContentApiContract, true>(
        client(),
        dualContentApiContract,
        { body: { name: 'test' }, streaming: true },
      )
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })

    it('mocks a no-body content entry', async () => {
      await helper.mockResponse(noBodyContentApiContract, {
        pathParams: { userId: '1' },
        responseStatus: 204,
      })
      const result = await sendByApiContract(client(), noBodyContentApiContract, {
        pathParams: { userId: '1' },
      })
      expect(result.result?.body).toBeNull()
    })
  })

  describe('mockResponse — range / wildcard status key fallback', () => {
    it('resolves response entry via range key when exact code is absent', async () => {
      await helper.mockResponse(getApiContractWith2xxRange, {
        responseStatus: 201,
        responseJson: { id: '42' },
      })
      const result = await sendByApiContract(client(), getApiContractWith2xxRange, {})
      expect(result.result?.body).toEqual({ id: '42' })
    })

    it('resolves response entry via default key when no exact or range key matches', async () => {
      await helper.mockResponse(getApiContractWithDefault, {
        responseStatus: 200,
        responseJson: { id: '7' },
      })
      const result = await sendByApiContract(client(), getApiContractWithDefault, {})
      expect(result.result?.body).toEqual({ id: '7' })
    })

    it('exact key takes priority over range key', async () => {
      await helper.mockResponse(getApiContractWithExactAndRange, {
        responseStatus: 200,
        responseJson: { id: 'exact' },
      })
      const result = await sendByApiContract(client(), getApiContractWithExactAndRange, {})
      expect(result.result?.body).toEqual({ id: 'exact' })
    })

    it('range key is used when exact code is absent but range matches', async () => {
      await helper.mockResponse(getApiContractWithExactAndRange, {
        responseStatus: 201,
        responseJson: { id: 'range', created: true },
      })
      const result = await sendByApiContract(client(), getApiContractWithExactAndRange, {})
      expect(result.result?.body).toEqual({ id: 'range', created: true })
    })
  })

  describe('mockResponse — NoBodyResponse', () => {
    it('replies with no body for noBodyResponse() entry', async () => {
      await helper.mockResponse(deleteApiContractWithNoBodyResponse, { responseStatus: 204 })
      const response = await client().url('/no-body').delete().res()
      expect(response.status).toBe(204)
    })
  })

  describe('mockResponse — HTTP methods', () => {
    it('mocks PATCH request', async () => {
      await helper.mockResponse(patchApiContract, {
        responseStatus: 200,
        responseJson: { id: '1' },
      })
      const result = await sendByApiContract(client(), patchApiContract, { body: { name: 'test' } })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks PUT request', async () => {
      await helper.mockResponse(putApiContract, { responseStatus: 200, responseJson: { id: '2' } })
      const result = await sendByApiContract(client(), putApiContract, { body: { name: 'test' } })
      expect(result.result?.body).toEqual({ id: '2' })
    })
  })

  describe('mockResponse — non-JSON response types', () => {
    it('mocks text response', async () => {
      await helper.mockResponse(textResponseApiContract, {
        responseStatus: 200,
        responseText: 'hello world',
      })
      const response = await client().url('/text').get().res()
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/plain')
      expect(await response.text()).toBe('hello world')
    })

    it('mocks blob response', async () => {
      await helper.mockResponse(blobResponseApiContract, {
        responseStatus: 200,
        responseBlob: 'binary-data',
      })
      const response = await client().url('/blob').get().res()
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/octet-stream')
    })

    it('replies with status only when anyOfResponses has no SSE or JSON entry', async () => {
      await helper.mockResponse(anyOfTextResponsesApiContract, { responseStatus: 200 })
      const response = await client().url('/any-of-text').get().res()
      expect(response.status).toBe(200)
    })
  })

  describe('mockResponse — error handling', () => {
    it('throws when responseStatus cannot be mapped with contract', async () => {
      await expect(
        // @ts-expect-error testing runtime error path with status code not in contract
        helper.mockResponse(getApiContract, { responseStatus: 999, responseJson: { id: 'x' } }),
      ).rejects.toThrow('Specified responseStatus cannot be mapped with contract')
    })
  })

  describe('mockResponse — extended range / wildcard status key fallback', () => {
    it('resolves response entry via 4xx range key', async () => {
      await helper.mockResponse(getApiContractWith4xxRange, {
        responseStatus: 404,
        responseJson: { id: 'not-found' },
      })
      const response = await fetch(`${mockServer.url}/not-found`)
      expect(response.status).toBe(404)
    })

    it('resolves response entry via 5xx range key', async () => {
      await helper.mockResponse(getApiContractWith5xxRange, {
        responseStatus: 503,
        responseJson: { id: 'error' },
      })
      const response = await fetch(`${mockServer.url}/server-error`)
      expect(response.status).toBe(503)
    })
  })
})
