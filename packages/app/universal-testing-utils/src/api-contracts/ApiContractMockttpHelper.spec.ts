import { sendByApiContract } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch from 'wretch'
import {
  dualModeApiContract,
  dualModeApiContractWithPathParams,
  getApiContract,
  getApiContractWithPathAndQueryParams,
  getApiContractWithPathParams,
  getApiContractWithQueryParams,
  noBodyApiContract,
  postApiContract,
  postApiContractWithPathParams,
  sseGetApiContract,
  sseGetApiContractWithPathParams,
  sseGetApiContractWithQueryParams,
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
})
