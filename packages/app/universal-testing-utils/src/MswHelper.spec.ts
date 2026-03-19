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

    it('mocks dual-mode contract with unvalidated response body', async () => {
      mswHelper.mockAnyResponse(sseDualModeContract, server, {
        responseBody: { error: 'Internal Server Error', code: 'ERR_500' },
        responseCode: 500,
        events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
      })

      const jsonResponse = await fetch(`${BASE_URL}/events/dual`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      })

      expect(jsonResponse.status).toBe(500)
      expect(await jsonResponse.json()).toEqual({
        error: 'Internal Server Error',
        code: 'ERR_500',
      })
    })

    it('mocks dual-mode contract SSE side via mockAnyResponse', async () => {
      mswHelper.mockAnyResponse(sseDualModeContract, server, {
        responseBody: { error: 'fail' },
        events: [{ event: 'completed', data: { totalCount: 42 } }],
      })

      const sseResponse = await wretchClient
        .headers({ accept: 'text/event-stream' })
        .url('/events/dual')
        .post({ name: 'test' })
        .res()

      expect(sseResponse.status).toBe(200)
      expect(sseResponse.headers.get('content-type')).toBe('text/event-stream')
      expect(await sseResponse.text()).toBe('event: completed\ndata: {"totalCount":42}\n')
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

    it('mocks dual-mode contract — returns JSON via handleRequest', async () => {
      mswHelper.mockValidResponseWithImplementation(sseDualModeContract, server, {
        handleRequest: async (requestInfo) => {
          const body = await requestInfo.request.json()
          return { id: `impl-${body.name}` }
        },
        events: [{ event: 'completed', data: { totalCount: 7 } }],
      })

      const response = await wretchClient
        .headers({ accept: 'application/json' })
        .url('/events/dual')
        .post({ name: 'test' })
        .res()

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ id: 'impl-test' })
    })

    it('mocks dual-mode contract — returns SSE when Accept is text/event-stream', async () => {
      mswHelper.mockValidResponseWithImplementation(sseDualModeContract, server, {
        handleRequest: async () => ({ id: 'unused' }),
        events: [
          { event: 'item.updated', data: { items: [{ id: '1' }] } },
          { event: 'completed', data: { totalCount: 3 } },
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
        'event: item.updated\ndata: {"items":[{"id":"1"}]}\n\nevent: completed\ndata: {"totalCount":3}\n',
      )
    })

    it('mocks dual-mode contract with path params', async () => {
      mswHelper.mockValidResponseWithImplementation(sseDualModeContractWithPathParams, server, {
        pathParams: { userId: ':userId' },
        handleRequest: async (requestInfo) => ({
          id: `user-${requestInfo.params.userId}`,
        }),
        events: [{ event: 'completed', data: { totalCount: 42 } }],
      })

      const jsonResponse = await wretchClient
        .headers({ accept: 'application/json' })
        .url('/users/55/events/dual')
        .post({ name: 'test' })
        .res()
      expect(await jsonResponse.json()).toEqual({ id: 'user-55' })

      const sseResponse = await wretchClient
        .headers({ accept: 'text/event-stream' })
        .url('/users/55/events/dual')
        .post({ name: 'test' })
        .res()
      expect(sseResponse.headers.get('content-type')).toBe('text/event-stream')
    })

    it('enforces dual-mode event name type safety', () => {
      // @ts-expect-error invalid event name
      mswHelper.mockValidResponseWithImplementation(sseDualModeContract, server, {
        handleRequest: async () => ({ id: '1' }),
        events: [{ event: 'nonexistent.event', data: { items: [{ id: '1' }] } }],
      })
    })

    it('enforces dual-mode event data type safety', () => {
      // @ts-expect-error wrong data shape for completed
      mswHelper.mockValidResponseWithImplementation(sseDualModeContract, server, {
        handleRequest: async () => ({ id: '1' }),
        events: [{ event: 'completed', data: { wrongField: 'value' } }],
      })
    })

    it('mocks dual-mode contract with custom response code', async () => {
      mswHelper.mockValidResponseWithImplementation(sseDualModeContract, server, {
        responseCode: 201,
        handleRequest: async () => ({ id: 'created' }),
        events: [{ event: 'completed', data: { totalCount: 1 } }],
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

  describe('mockSseStream', () => {
    it('emits SSE events on demand for SSE contract', async () => {
      const controller = mswHelper.mockSseStream(sseGetContract, server)

      const response = await wretchClient.get('/events/stream').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')

      controller.emit({ event: 'item.updated', data: { items: [{ id: '1' }] } })
      controller.emit({ event: 'completed', data: { totalCount: 1 } })
      controller.close()

      const body = await response.text()
      expect(body).toBe(
        'event: item.updated\ndata: {"items":[{"id":"1"}]}\n\nevent: completed\ndata: {"totalCount":1}\n\n',
      )
    })

    it('works with SSE contract with path params', async () => {
      const controller = mswHelper.mockSseStream(sseGetContractWithPathParams, server, {
        pathParams: { userId: '42' },
      })

      const response = await wretchClient.get('/users/42/events').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')

      controller.emit({ event: 'completed', data: { totalCount: 5 } })
      controller.close()

      const body = await response.text()
      expect(body).toBe('event: completed\ndata: {"totalCount":5}\n\n')
    })

    it('works with SSE POST contract', async () => {
      const controller = mswHelper.mockSseStream(ssePostContract, server)

      const response = await wretchClient.url('/events/stream').post({ name: 'test' }).res()

      expect(response.status).toBe(200)

      controller.emit({ event: 'item.updated', data: { items: [{ id: '2' }] } })
      controller.close()

      const body = await response.text()
      expect(body).toBe('event: item.updated\ndata: {"items":[{"id":"2"}]}\n\n')
    })

    it('dual-mode returns JSON for non-SSE Accept header', async () => {
      const controller = mswHelper.mockSseStream(sseDualModeContract, server, {
        responseBody: { id: 'json-stream' },
      })

      const response = await wretchClient
        .headers({ accept: 'application/json' })
        .url('/events/dual')
        .post({ name: 'test' })
        .res()

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ id: 'json-stream' })

      controller.close()
    })

    it('dual-mode streams SSE events on demand', async () => {
      const controller = mswHelper.mockSseStream(sseDualModeContract, server, {
        responseBody: { id: 'unused' },
      })

      const response = await wretchClient
        .headers({ accept: 'text/event-stream' })
        .url('/events/dual')
        .post({ name: 'test' })
        .res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')

      controller.emit({ event: 'item.updated', data: { items: [{ id: '1' }] } })
      controller.emit({ event: 'completed', data: { totalCount: 42 } })
      controller.close()

      const body = await response.text()
      expect(body).toBe(
        'event: item.updated\ndata: {"items":[{"id":"1"}]}\n\nevent: completed\ndata: {"totalCount":42}\n\n',
      )
    })

    it('dual-mode with path params streams SSE events', async () => {
      const controller = mswHelper.mockSseStream(sseDualModeContractWithPathParams, server, {
        pathParams: { userId: '99' },
        responseBody: { id: 'json-99' },
      })

      const sseResponse = await wretchClient
        .headers({ accept: 'text/event-stream' })
        .url('/users/99/events/dual')
        .post({ name: 'test' })
        .res()

      controller.emit({ event: 'completed', data: { totalCount: 7 } })
      controller.close()

      expect(sseResponse.headers.get('content-type')).toBe('text/event-stream')
      expect(await sseResponse.text()).toBe('event: completed\ndata: {"totalCount":7}\n\n')
    })

    it('works with SSE contract with query params', async () => {
      const controller = mswHelper.mockSseStream(sseGetContractWithQueryParams, server, {
        queryParams: { yearFrom: 2020 },
      })

      const response = await wretchClient.get('/events/stream?yearFrom=2020').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')

      controller.emit({ event: 'completed', data: { totalCount: 10 } })
      controller.close()

      const body = await response.text()
      expect(body).toBe('event: completed\ndata: {"totalCount":10}\n\n')
    })

    it('dual-mode enforces responseBody type safety', () => {
      // @ts-expect-error wrong response body shape
      mswHelper.mockSseStream(sseDualModeContract, server, {
        responseBody: { wrongField: 'value' },
      })
    })

    it('supports custom response code', async () => {
      const controller = mswHelper.mockSseStream(sseGetContract, server, {
        responseCode: 201,
      })

      const response = await wretchClient.get('/events/stream').res()

      expect(response.status).toBe(201)

      controller.close()
    })

    it('enforces event name type safety on controller', () => {
      const controller = mswHelper.mockSseStream(sseGetContract, server)

      // @ts-expect-error invalid event name
      controller.emit({ event: 'nonexistent.event', data: { items: [{ id: '1' }] } })

      controller.close()
    })

    it('enforces event data type safety on controller', () => {
      const controller = mswHelper.mockSseStream(sseGetContract, server)

      // @ts-expect-error wrong data shape for item.updated
      controller.emit({ event: 'item.updated', data: { wrongField: 'value' } })

      controller.close()
    })

    it('enforces dual-mode controller event type safety', () => {
      const controller = mswHelper.mockSseStream(sseDualModeContract, server, {
        responseBody: { id: '1' },
      })

      // @ts-expect-error invalid event name
      controller.emit({ event: 'nonexistent', data: {} })

      controller.close()
    })
  })
})
