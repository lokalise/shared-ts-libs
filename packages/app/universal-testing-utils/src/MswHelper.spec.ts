import { mapRouteToPath } from '@lokalise/api-contracts'
import { sendByContract } from '@lokalise/frontend-http-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch from 'wretch'
import {
  getContract,
  getContractWithPathParams,
  getContractWithQueryParams,
  postContract,
  postContractWithPathParams,
  sseDualModeContract,
  sseGetContract,
  sseGetContractWithPathParams,
  sseGetContractWithQueryParams,
  ssePostContract,
} from '../test/testContracts.ts'
import { MswHelper } from './MswHelper.ts'

const BASE_URL = 'http://localhost:8080'

describe('MswHelper', () => {
  const server = setupServer()
  const mswHelper = new MswHelper(BASE_URL)
  const wretchClient = wretch(BASE_URL)

  beforeEach(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })
  afterEach(() => {
    server.resetHandlers()
  })
  afterAll(() => {
    server.close()
  })

  describe('mockValidPayloadResponse', () => {
    it('mocks POST request without path params', async () => {
      mswHelper.mockValidResponse(postContract, server, {
        responseBody: { id: '1' },
      })

      const response = await sendByContract(wretchClient, postContract, {
        body: { name: 'frf' },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "1",
              }
            `)
    })

    it('mocks POST request with path params', async () => {
      mswHelper.mockValidResponse(postContractWithPathParams, server, {
        pathParams: { userId: '3' },
        responseBody: { id: '2' },
      })

      const response = await sendByContract(wretchClient, postContractWithPathParams, {
        pathParams: {
          userId: '3',
        },
        body: { name: 'frf' },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "2",
              }
            `)
    })

    it('enforces POST request with path params contract', async () => {
      mswHelper.mockValidResponse(postContractWithPathParams, server, {
        // @ts-expect-error this should fail - wrong property
        pathParams: { userId: '3', invalid: 'invalid' },
        // @ts-expect-error this should fail - wrong property
        responseBody: { id: '2', invalidField: 'frfr' },
      })

      const response = await sendByContract(wretchClient, postContractWithPathParams, {
        pathParams: {
          userId: '3',
        },
        body: { name: 'frf' },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "2",
              }
            `)
    })

    it('mocks GET request without path params', async () => {
      mswHelper.mockValidResponse(getContract, server, {
        responseBody: { id: '1' },
      })

      const response = await sendByContract(wretchClient, getContract, {})

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "1",
              }
            `)
    })

    it('mocks GET request with path params', async () => {
      mswHelper.mockValidResponse(getContractWithPathParams, server, {
        pathParams: { userId: '3' },
        responseBody: { id: '2' },
      })

      const response = await sendByContract(wretchClient, getContractWithPathParams, {
        pathParams: {
          userId: '3',
        },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "2",
              }
            `)
    })
  })

  describe('mockValidResponseWithAnyPath', () => {
    it('mocks POST request without path params', async () => {
      mswHelper.mockValidResponseWithAnyPath(postContract, server, {
        responseBody: { id: '1' },
      })

      const response = await sendByContract(wretchClient, postContract, {
        body: { name: 'frf' },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "1",
              }
            `)
    })

    it('mocks POST request with path params', async () => {
      mswHelper.mockValidResponseWithAnyPath(postContractWithPathParams, server, {
        responseBody: { id: '2' },
      })

      const response = await sendByContract(wretchClient, postContractWithPathParams, {
        pathParams: {
          userId: '9',
        },
        body: { name: 'frf' },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "2",
              }
            `)
    })

    it('mocks GET request without path params', async () => {
      mswHelper.mockValidResponseWithAnyPath(getContract, server, {
        responseBody: { id: '1' },
      })

      const response = await sendByContract(wretchClient, getContract, {})

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "1",
              }
            `)
    })

    it('mocks GET request with path params', async () => {
      mswHelper.mockValidResponseWithAnyPath(getContractWithPathParams, server, {
        responseBody: { id: '2' },
      })

      const response = await sendByContract(wretchClient, getContractWithPathParams, {
        pathParams: {
          userId: '11',
        },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "2",
              }
            `)
    })
  })

  describe('mockAnyResponse', () => {
    it('mocks POST request without path params', async () => {
      mswHelper.mockAnyResponse(postContract, server, {
        responseBody: { wrongId: '1' },
      })

      const response = await wretchClient.post({ name: 'frf' }, mapRouteToPath(postContract))

      expect(await response.json()).toMatchInlineSnapshot(`
              {
                "wrongId": "1",
              }
            `)
    })

    it('accepts any response shape', async () => {
      mswHelper.mockAnyResponse(postContract, server, {
        responseBody: { wrongId: '1', wrongField: 'wrong' },
      })

      const response = await wretchClient.post({ name: 'frf' }, mapRouteToPath(postContract))

      expect(await response.json()).toMatchInlineSnapshot(`
        {
          "wrongField": "wrong",
          "wrongId": "1",
        }
      `)
    })

    it('mocks GET request without path params', async () => {
      mswHelper.mockAnyResponse(getContract, server, {
        responseBody: { wrongId: '1' },
      })

      const response = await wretchClient.get(mapRouteToPath(postContract))

      expect(await response.json()).toMatchInlineSnapshot(`
              {
                "wrongId": "1",
              }
            `)
    })
  })

  describe('mockValidResponseWithImplementation', () => {
    it('mocks GET request without path params with query params with custom implementation', async () => {
      mswHelper.mockValidResponseWithImplementation(getContractWithQueryParams, server, {
        handleRequest: (requestInfo) => {
          // msw doesn't parse query params on its own
          const url = new URL(requestInfo.request.url)
          return {
            id: url.searchParams.get('yearFrom')!,
          }
        },
      })

      const response = await sendByContract(wretchClient, getContractWithQueryParams, {
        queryParams: { yearFrom: 2000 },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "2000",
              }
            `)
    })

    it('mocks POST request without path params with custom implementation', async () => {
      const mock = vi.fn()

      mswHelper.mockValidResponseWithImplementation(postContract, server, {
        handleRequest: async (requestInfo) => {
          const requestBody = await requestInfo.request.json()
          mock(requestBody)

          return {
            id: requestBody.name,
          }
        },
      })

      const response = await sendByContract(wretchClient, postContract, {
        body: { name: 'test-name' },
      })

      expect(mock).toHaveBeenCalledWith({ name: 'test-name' })
      expect(response).toMatchInlineSnapshot(`
              {
                "id": "test-name",
              }
            `)
    })

    it('mocks POST request with path params with custom implementation', async () => {
      const mock = vi.fn()

      mswHelper.mockValidResponseWithImplementation(postContractWithPathParams, server, {
        pathParams: { userId: ':userId' },
        handleRequest: async (requestInfo) => {
          mock(await requestInfo.request.json())

          return {
            id: `id-${requestInfo.params.userId}`,
          }
        },
      })

      const response = await sendByContract(wretchClient, postContractWithPathParams, {
        pathParams: {
          userId: '3',
        },
        body: { name: 'test-name' },
      })

      expect(mock).toHaveBeenCalledWith({ name: 'test-name' })
      expect(response).toMatchInlineSnapshot(`
              {
                "id": "id-3",
              }
            `)
    })
  })

  describe('mockSseResponse', () => {
    it('mocks GET SSE without path params', async () => {
      mswHelper.mockSseResponse(sseGetContract, server, {
        events: [
          { event: 'item.updated', data: { items: [{ id: '1' }] } },
          { event: 'completed', data: { totalCount: 1 } },
        ],
      })

      const response = await wretchClient.get('/events/stream').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')

      const body = await response.text()
      expect(body).toBe(
        'event: item.updated\ndata: {"items":[{"id":"1"}]}\n\nevent: completed\ndata: {"totalCount":1}\n',
      )
    })

    it('mocks POST SSE', async () => {
      mswHelper.mockSseResponse(ssePostContract, server, {
        events: [{ event: 'item.updated', data: { items: [{ id: '2' }] } }],
      })

      const response = await wretchClient.url('/events/stream').post({ name: 'test' }).res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
    })

    it('mocks GET SSE with path params', async () => {
      mswHelper.mockSseResponse(sseGetContractWithPathParams, server, {
        pathParams: { userId: '42' },
        events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
      })

      const response = await wretchClient.get('/users/42/events').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
    })

    it('mocks GET SSE with query params', async () => {
      mswHelper.mockSseResponse(sseGetContractWithQueryParams, server, {
        queryParams: { yearFrom: 2020 },
        events: [{ event: 'completed', data: { totalCount: 5 } }],
      })

      const response = await wretchClient.get('/events/stream?yearFrom=2020').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')

      const body = await response.text()
      expect(body).toBe('event: completed\ndata: {"totalCount":5}\n')
    })

    it('mocks dual-mode contract', async () => {
      mswHelper.mockSseResponse(sseDualModeContract, server, {
        events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
      })

      const response = await wretchClient.url('/events/dual').post({ name: 'test' }).res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
    })

    it('supports custom response code', async () => {
      mswHelper.mockSseResponse(sseGetContract, server, {
        responseCode: 201,
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })

      const response = await wretchClient.get('/events/stream').res()

      expect(response.status).toBe(201)
    })

    it('enforces pathParams required for contracts with path params', () => {
      mswHelper.mockSseResponse(sseGetContractWithPathParams, server, {
        // @ts-expect-error pathParams should require userId
        pathParams: { wrongParam: '1' },
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })
    })

    it('enforces pathParams not allowed for contracts without path params', () => {
      mswHelper.mockSseResponse(sseGetContract, server, {
        // @ts-expect-error pathParams should not be allowed
        pathParams: { userId: '1' },
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })
    })

    it('enforces event name type safety', () => {
      mswHelper.mockSseResponse(sseGetContract, server, {
        events: [
          // @ts-expect-error invalid event name
          { event: 'nonexistent.event', data: { items: [{ id: '1' }] } },
        ],
      })
    })

    it('enforces event data type safety', () => {
      mswHelper.mockSseResponse(sseGetContract, server, {
        events: [
          // @ts-expect-error wrong data shape for item.updated
          { event: 'item.updated', data: { wrongField: 'value' } },
        ],
      })
    })
  })
})
