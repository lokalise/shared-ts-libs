import { sendByContract } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import {
  getContract,
  getContractWithPathAndQueryParams,
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
import { MockttpHelper } from './MockttpHelper.ts'

describe('MockttpHelper', () => {
  const mockServer = getLocal()
  const mockttpHelper = new MockttpHelper(mockServer)
  let wretchClient: Wretch

  beforeEach(async () => {
    await mockServer.start()
    wretchClient = wretch(mockServer.url)
  })
  afterEach(() => mockServer.stop())

  describe('mockValidResponse — REST contracts', () => {
    it('mocks POST request without path params', async () => {
      await mockttpHelper.mockValidResponse(postContract, {
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

    it('enforces POST contract', async () => {
      // @ts-expect-error this should fail - wrong property
      await mockttpHelper.mockValidResponse(postContract, {
        responseBody: { id: '1', wrong: 'wrong' },
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
      await mockttpHelper.mockValidResponse(postContractWithPathParams, {
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

    it('mocks GET request without path params', async () => {
      await mockttpHelper.mockValidResponse(getContract, {
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
      await mockttpHelper.mockValidResponse(getContractWithPathParams, {
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

    it('mocks GET request with query params', async () => {
      await mockttpHelper.mockValidResponse(getContractWithQueryParams, {
        queryParams: { yearFrom: 2020 },
        responseBody: { id: '1' },
      })

      const response = await sendByContract(wretchClient, getContractWithQueryParams, {
        queryParams: { yearFrom: 2020 },
      })

      expect(response).toMatchInlineSnapshot(`
        {
          "id": "1",
        }
      `)
    })

    it('mocks GET request with path params and query params', async () => {
      await mockttpHelper.mockValidResponse(getContractWithPathAndQueryParams, {
        pathParams: { userId: '3' },
        queryParams: { yearFrom: 2020 },
        responseBody: { id: '2' },
      })

      const response = await sendByContract(wretchClient, getContractWithPathAndQueryParams, {
        pathParams: { userId: '3' },
        queryParams: { yearFrom: 2020 },
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
      await mockttpHelper.mockAnyResponse(postContract, {
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

    it('enforces POST contract', async () => {
      await mockttpHelper.mockAnyResponse(postContract, {
        responseBody: { id: '1', wrong: 'wrong' },
        responseCode: 500,
      })

      await expect(
        sendByContract(wretchClient, postContract, {
          body: { name: 'frf' },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: {"id":"1","wrong":"wrong"}]`)
    })

    it('mocks POST request with path params', async () => {
      await mockttpHelper.mockAnyResponse(postContractWithPathParams, {
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

    it('mocks GET request without path params', async () => {
      await mockttpHelper.mockAnyResponse(getContract, {
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
      await mockttpHelper.mockAnyResponse(getContractWithPathParams, {
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

  describe('mockValidResponse — SSE contracts', () => {
    it('mocks GET SSE without path params', async () => {
      await mockttpHelper.mockValidResponse(sseGetContract, {
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
      await mockttpHelper.mockValidResponse(ssePostContract, {
        events: [{ event: 'item.updated', data: { items: [{ id: '2' }] } }],
      })

      const response = await wretchClient.url('/events/stream').post({ name: 'test' }).res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
    })

    it('mocks GET SSE with path params', async () => {
      await mockttpHelper.mockValidResponse(sseGetContractWithPathParams, {
        pathParams: { userId: '42' },
        events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
      })

      const response = await wretchClient.get('/users/42/events').res()

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/event-stream')
    })

    it('mocks GET SSE with query params', async () => {
      await mockttpHelper.mockValidResponse(sseGetContractWithQueryParams, {
        queryParams: { yearFrom: 2020 },
        events: [{ event: 'completed', data: { totalCount: 5 } }],
      })

      const response = await wretchClient.get('/events/stream?yearFrom=2020').res()

      expect(response.status).toBe(200)
      const body = await response.text()
      expect(body).toBe('event: completed\ndata: {"totalCount":5}\n')
    })

    it('supports custom response code', async () => {
      await mockttpHelper.mockValidResponse(sseGetContract, {
        responseCode: 201,
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })

      const response = await wretchClient.get('/events/stream').res()

      expect(response.status).toBe(201)
    })

    it('enforces pathParams required for contracts with path params', async () => {
      // @ts-expect-error pathParams should require userId
      await mockttpHelper.mockValidResponse(sseGetContractWithPathParams, {
        pathParams: { wrongParam: '1' },
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })
    })

    it('enforces pathParams not allowed for contracts without path params', async () => {
      // @ts-expect-error pathParams should not be allowed
      await mockttpHelper.mockValidResponse(sseGetContract, {
        pathParams: { userId: '1' },
        events: [{ event: 'completed', data: { totalCount: 0 } }],
      })
    })

    it('enforces event name type safety', async () => {
      // @ts-expect-error invalid event name
      await mockttpHelper.mockValidResponse(sseGetContract, {
        events: [{ event: 'nonexistent.event', data: { items: [{ id: '1' }] } }],
      })
    })

    it('enforces event data type safety', async () => {
      // @ts-expect-error wrong data shape for item.updated
      await mockttpHelper.mockValidResponse(sseGetContract, {
        events: [{ event: 'item.updated', data: { wrongField: 'value' } }],
      })
    })
  })

  describe('mockValidResponse — dual-mode contracts', () => {
    it('returns JSON when Accept is application/json', async () => {
      await mockttpHelper.mockValidResponse(sseDualModeContract, {
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
      await mockttpHelper.mockValidResponse(sseDualModeContract, {
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
      await mockttpHelper.mockValidResponse(sseDualModeContractWithPathParams, {
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

    it('supports custom response code', async () => {
      await mockttpHelper.mockValidResponse(sseDualModeContract, {
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

    it('validates response body against schema', async () => {
      await expect(
        // @ts-expect-error wrong response body shape
        mockttpHelper.mockValidResponse(sseDualModeContract, {
          responseBody: { wrongField: 'value' },
          events: [],
        }),
      ).rejects.toThrow()
    })

    it('enforces event type safety', async () => {
      // @ts-expect-error invalid event name
      await mockttpHelper.mockValidResponse(sseDualModeContract, {
        responseBody: { id: '1' },
        events: [{ event: 'nonexistent.event', data: { items: [{ id: '1' }] } }],
      })
    })
  })
})
