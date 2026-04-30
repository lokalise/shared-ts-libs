import { sendByApiContract } from '@lokalise/frontend-http-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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
import { ApiContractMswHelper } from './ApiContractMswHelper.ts'

const BASE_URL = 'http://localhost:8080'

describe('ApiContractMswHelper', () => {
  const server = setupServer()
  const helper = new ApiContractMswHelper(BASE_URL)
  const wretchClient = wretch(BASE_URL)

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  describe('mockResponse — REST contracts', () => {
    it('mocks GET without path params', async () => {
      helper.mockResponse(getApiContract, server, { responseStatus: 200, responseBody: { id: '1' } })
      const result = await sendByApiContract(wretchClient, getApiContract, {})
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('enforces GET contract schema (strips unknown properties)', async () => {
      // @ts-expect-error wrong property on responseBody
      helper.mockResponse(getApiContract, server, {
        responseStatus: 200,
        responseBody: { id: '1', wrong: 'x' },
      })
      const result = await sendByApiContract(wretchClient, getApiContract, {})
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks GET with path params', async () => {
      helper.mockResponse(getApiContractWithPathParams, server, {
        pathParams: { userId: '3' },
        responseStatus: 200,
        responseBody: { id: '3' },
      })
      const result = await sendByApiContract(wretchClient, getApiContractWithPathParams, {
        pathParams: { userId: '3' },
      })
      expect(result.result?.body).toEqual({ id: '3' })
    })

    it('mocks GET with query params', async () => {
      helper.mockResponse(getApiContractWithQueryParams, server, {
        responseStatus: 200,
        queryParams: { yearFrom: 2024 },
        responseBody: { id: '1' },
      })
      const result = await sendByApiContract(wretchClient, getApiContractWithQueryParams, {
        queryParams: { yearFrom: 2024 },
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks GET with path and query params', async () => {
      helper.mockResponse(getApiContractWithPathAndQueryParams, server, {
        pathParams: { userId: '3' },
        queryParams: { yearFrom: 2024 },
        responseStatus: 200,
        responseBody: { id: '3' },
      })
      const result = await sendByApiContract(wretchClient, getApiContractWithPathAndQueryParams, {
        pathParams: { userId: '3' },
        queryParams: { yearFrom: 2024 },
      })
      expect(result.result?.body).toEqual({ id: '3' })
    })

    it('mocks POST without path params', async () => {
      helper.mockResponse(postApiContract, server, { responseStatus: 200, responseBody: { id: '1' } })
      const result = await sendByApiContract(wretchClient, postApiContract, {
        body: { name: 'test' },
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('mocks POST with path params', async () => {
      helper.mockResponse(postApiContractWithPathParams, server, {
        pathParams: { userId: '3' },
        responseStatus: 200,
        responseBody: { id: '2' },
      })
      const result = await sendByApiContract(wretchClient, postApiContractWithPathParams, {
        pathParams: { userId: '3' },
        body: { name: 'test' },
      })
      expect(result.result?.body).toEqual({ id: '2' })
    })

    it('mocks no-body DELETE response (204)', async () => {
      helper.mockResponse(noBodyApiContract, server, {
        pathParams: { userId: '1' },
        responseStatus: 204,
      })
      const result = await sendByApiContract(wretchClient, noBodyApiContract, {
        pathParams: { userId: '1' },
      })
      expect(result.result?.body).toBeNull()
    })
  })

  describe('mockResponseWithAnyPath', () => {
    it('matches any path param value', async () => {
      helper.mockResponseWithAnyPath(getApiContractWithPathParams, server, {
        responseStatus: 200,
        responseBody: { id: 'any' },
      })
      const result = await sendByApiContract(wretchClient, getApiContractWithPathParams, {
        pathParams: { userId: 'whatever' },
      })
      expect(result.result?.body).toEqual({ id: 'any' })
    })
  })

  describe('mockResponseWithImplementation', () => {
    it('calls handleRequest and returns its result', async () => {
      helper.mockResponseWithImplementation(getApiContractWithPathParams, server, {
        pathParams: { userId: '5' },
        handleRequest: () => ({ id: 'from-impl' }),
      })
      const result = await sendByApiContract(wretchClient, getApiContractWithPathParams, {
        pathParams: { userId: '5' },
      })
      expect(result.result?.body).toEqual({ id: 'from-impl' })
    })

    it('supports MockResponseWrapper with custom status', async () => {
      helper.mockResponseWithImplementation(getApiContractWithPathParams, server, {
        pathParams: { userId: '5' },
        handleRequest: () => ApiContractMswHelper.response({ id: 'wrapped' }, { status: 200 }),
      })
      const result = await sendByApiContract(wretchClient, getApiContractWithPathParams, {
        pathParams: { userId: '5' },
      })
      expect(result.result?.body).toEqual({ id: 'wrapped' })
    })
  })

  describe('mockResponse — SSE contracts', () => {
    it('mocks SSE-only GET response', async () => {
      helper.mockResponse(sseGetApiContract, server, {
        responseStatus: 200,
        events: [
          { event: 'item.updated', data: { items: [{ id: '1' }] } },
          { event: 'completed', data: { totalCount: 1 } },
        ],
      })
      const result = await sendByApiContract(wretchClient, sseGetApiContract, {})
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(2)
    })

    it('mocks SSE with path params', async () => {
      helper.mockResponse(sseGetApiContractWithPathParams, server, {
        pathParams: { userId: '5' },
        responseStatus: 200,
        events: [{ event: 'completed', data: { totalCount: 5 } }],
      })
      const result = await sendByApiContract(wretchClient, sseGetApiContractWithPathParams, {
        pathParams: { userId: '5' },
      })
      const events: unknown[] = []
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
    })

    it('mocks SSE with query params', async () => {
      helper.mockResponse(sseGetApiContractWithQueryParams, server, {
        responseStatus: 200,
        queryParams: { yearFrom: 2024 },
        events: [{ event: 'completed', data: { totalCount: 3 } }],
      })
      const result = await sendByApiContract(wretchClient, sseGetApiContractWithQueryParams, {
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
      helper.mockResponse(dualModeApiContract, server, {
        responseStatus: 200,
        responseBody: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract(wretchClient, dualModeApiContract, {
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '1' })
    })

    it('returns SSE when Accept: text/event-stream', async () => {
      helper.mockResponse(dualModeApiContract, server, {
        responseStatus: 200,
        responseBody: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })
      const result = await sendByApiContract<typeof dualModeApiContract, true>(
        wretchClient,
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
      helper.mockResponse(dualModeApiContractWithPathParams, server, {
        pathParams: { userId: '2' },
        responseStatus: 200,
        responseBody: { id: '2' },
        events: [{ event: 'completed', data: { totalCount: 2 } }],
      })
      const result = await sendByApiContract(wretchClient, dualModeApiContractWithPathParams, {
        pathParams: { userId: '2' },
        body: { name: 'test' },
        streaming: false,
      })
      expect(result.result?.body).toEqual({ id: '2' })
    })
  })

  describe('mockSseStream', () => {
    it('returns a live streaming controller for SSE-only contract', async () => {
      const controller = helper.mockSseStream(sseGetApiContract, server)
      const events: unknown[] = []

      const resultPromise = sendByApiContract(wretchClient, sseGetApiContract, {})

      await new Promise((resolve) => setTimeout(resolve, 20))
      controller.emit({ event: 'completed', data: { totalCount: 42 } })
      controller.close()

      const result = await resultPromise
      for await (const event of result.result!.body) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
      expect((events[0] as any).data).toEqual({ totalCount: 42 })
    })
  })
})
