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
  sseDualModeContractWithPathParams,
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

  describe('mockValidResponse — REST contracts', () => {
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
      // @ts-expect-error this should fail - wrong properties
      mswHelper.mockValidResponse(postContractWithPathParams, server, {
        pathParams: { userId: '3', invalid: 'invalid' },
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

    it('mocks SSE contract with any path params', async () => {
      mswHelper.mockValidResponseWithAnyPath(sseGetContractWithPathParams, server, {
        events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
      })

      const response = await wretchClient.get('/users/any-user/events').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
    })

    it('mocks dual-mode contract with any path params', async () => {
      mswHelper.mockValidResponseWithAnyPath(sseDualModeContractWithPathParams, server, {
        responseBody: { id: 'json-any' },
        events: [{ event: 'completed', data: { totalCount: 1 } }],
      })

      const jsonResponse = await wretchClient
        .headers({ accept: 'application/json' })
        .url('/users/any-user/events/dual')
        .post({ name: 'test' })
        .res()
      expect(await jsonResponse.json()).toEqual({ id: 'json-any' })

      const sseResponse = await wretchClient
        .headers({ accept: 'text/event-stream' })
        .url('/users/other-user/events/dual')
        .post({ name: 'test' })
        .res()
      expect(sseResponse.headers.get('content-type')).toBe('text/event-stream')
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

  describe('mockValidResponse — SSE contracts', () => {
    it('mocks GET SSE without path params', async () => {
      mswHelper.mockValidResponse(sseGetContract, server, {
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
      mswHelper.mockValidResponse(ssePostContract, server, {
        events: [{ event: 'item.updated', data: { items: [{ id: '2' }] } }],
      })

      const response = await wretchClient.url('/events/stream').post({ name: 'test' }).res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
    })

    it('mocks GET SSE with path params', async () => {
      mswHelper.mockValidResponse(sseGetContractWithPathParams, server, {
        pathParams: { userId: '42' },
        events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
      })

      const response = await wretchClient.get('/users/42/events').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
    })

    it('mocks GET SSE with query params', async () => {
      mswHelper.mockValidResponse(sseGetContractWithQueryParams, server, {
        queryParams: { yearFrom: 2020 },
        events: [{ event: 'completed', data: { totalCount: 5 } }],
      })

      const response = await wretchClient.get('/events/stream?yearFrom=2020').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')

      const body = await response.text()
      expect(body).toBe('event: completed\ndata: {"totalCount":5}\n')
    })

    it('supports custom response code', async () => {
      mswHelper.mockValidResponse(sseGetContract, server, {
        responseCode: 201,
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })

      const response = await wretchClient.get('/events/stream').res()

      expect(response.status).toBe(201)
    })

    it('enforces pathParams required for contracts with path params', () => {
      // @ts-expect-error pathParams should require userId
      mswHelper.mockValidResponse(sseGetContractWithPathParams, server, {
        pathParams: { wrongParam: '1' },
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })
    })

    it('enforces pathParams not allowed for contracts without path params', () => {
      // @ts-expect-error pathParams should not be allowed
      mswHelper.mockValidResponse(sseGetContract, server, {
        pathParams: { userId: '1' },
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })
    })

    it('enforces event name type safety', () => {
      // @ts-expect-error invalid event name
      mswHelper.mockValidResponse(sseGetContract, server, {
        events: [{ event: 'nonexistent.event', data: { items: [{ id: '1' }] } }],
      })
    })

    it('enforces event data type safety', () => {
      // @ts-expect-error wrong data shape for item.updated
      mswHelper.mockValidResponse(sseGetContract, server, {
        events: [{ event: 'item.updated', data: { wrongField: 'value' } }],
      })
    })
  })

  describe('mockValidResponse — dual-mode contracts', () => {
    it('returns JSON when Accept is application/json', async () => {
      mswHelper.mockValidResponse(sseDualModeContract, server, {
        responseBody: { id: 'json-1' },
        events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
      })

      const response = await wretchClient
        .headers({ accept: 'application/json' })
        .url('/events/dual')
        .post({ name: 'test' })
        .res()

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ id: 'json-1' })
    })

    it('returns SSE when Accept is text/event-stream', async () => {
      mswHelper.mockValidResponse(sseDualModeContract, server, {
        responseBody: { id: 'json-1' },
        events: [
          { event: 'item.updated', data: { items: [{ id: '1' }] } },
          { event: 'completed', data: { totalCount: 1 } },
        ],
      })

      const response = await wretchClient
        .headers({ accept: 'text/event-stream' })
        .url('/events/dual')
        .post({ name: 'test' })
        .res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
      expect(await response.text()).toBe(
        'event: item.updated\ndata: {"items":[{"id":"1"}]}\n\nevent: completed\ndata: {"totalCount":1}\n',
      )
    })

    it('works with path params', async () => {
      mswHelper.mockValidResponse(sseDualModeContractWithPathParams, server, {
        pathParams: { userId: '42' },
        responseBody: { id: 'json-42' },
        events: [{ event: 'completed', data: { totalCount: 99 } }],
      })

      const jsonResponse = await wretchClient
        .headers({ accept: 'application/json' })
        .url('/users/42/events/dual')
        .post({ name: 'test' })
        .res()
      expect(await jsonResponse.json()).toEqual({ id: 'json-42' })

      const sseResponse = await wretchClient
        .headers({ accept: 'text/event-stream' })
        .url('/users/42/events/dual')
        .post({ name: 'test' })
        .res()
      expect(sseResponse.headers.get('content-type')).toBe('text/event-stream')
      expect(await sseResponse.text()).toBe('event: completed\ndata: {"totalCount":99}\n')
    })

    it('validates response body against schema', () => {
      expect(() =>
        // @ts-expect-error wrong response body shape
        mswHelper.mockValidResponse(sseDualModeContract, server, {
          responseBody: { wrongField: 'value' },
          events: [],
        }),
      ).toThrow()
    })

    it('supports custom response code', async () => {
      mswHelper.mockValidResponse(sseDualModeContract, server, {
        responseCode: 201,
        responseBody: { id: '1' },
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })

      const jsonResponse = await wretchClient
        .headers({ accept: 'application/json' })
        .url('/events/dual')
        .post({ name: 'test' })
        .res()
      expect(jsonResponse.status).toBe(201)

      const sseResponse = await wretchClient
        .headers({ accept: 'text/event-stream' })
        .url('/events/dual')
        .post({ name: 'test' })
        .res()
      expect(sseResponse.status).toBe(201)
    })

    it('enforces event type safety', () => {
      // @ts-expect-error invalid event name
      mswHelper.mockValidResponse(sseDualModeContract, server, {
        responseBody: { id: '1' },
        events: [{ event: 'nonexistent.event', data: { items: [{ id: '1' }] } }],
      })
    })
  })
})
