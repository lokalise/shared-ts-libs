import { mapRouteToPath } from '@lokalise/api-contracts'
import { sendByGetRoute, sendByPayloadRoute } from '@lokalise/frontend-http-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch from 'wretch'
import {
  getContract,
  getContractWithPathParams,
  postContract,
  postContractWithPathParams,
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

      const response = await sendByPayloadRoute(wretchClient, postContract, {
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

      const response = await sendByPayloadRoute(wretchClient, postContractWithPathParams, {
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

      const response = await sendByGetRoute(wretchClient, getContract, {})

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

      const response = await sendByGetRoute(wretchClient, getContractWithPathParams, {
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

      const response = await sendByPayloadRoute(wretchClient, postContract, {
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

      const response = await sendByPayloadRoute(wretchClient, postContractWithPathParams, {
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

      const response = await sendByGetRoute(wretchClient, getContract, {})

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

      const response = await sendByGetRoute(wretchClient, getContractWithPathParams, {
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
    it('mocks POST request without path params with custom implementation', async () => {
      const mock = vi.fn()

      mswHelper.mockValidResponseWithImplementation(postContract, server, {
        handleRequest: (dto) => {
          mock(dto)

          return {
            id: 'test-id',
          }
        },
      })

      const response = await sendByPayloadRoute(wretchClient, postContract, {
        body: { name: 'test-name' },
      })

      expect(mock).toHaveBeenCalledWith({ name: 'test-name' })
      expect(response).toMatchInlineSnapshot(`
              {
                "id": "test-id",
              }
            `)
    })

    it('mocks POST request with path params with custom implementation', async () => {
      const mock = vi.fn()

      mswHelper.mockValidResponseWithImplementation(postContractWithPathParams, server, {
        pathParams: { userId: '3' },
        handleRequest: (dto) => {
          mock(dto)

          return {
            id: 'test-id',
          }
        },
      })

      const response = await sendByPayloadRoute(wretchClient, postContractWithPathParams, {
        pathParams: {
          userId: '3',
        },
        body: { name: 'test-name' },
      })

      expect(mock).toHaveBeenCalledWith({ name: 'test-name' })
      expect(response).toMatchInlineSnapshot(`
              {
                "id": "test-id",
              }
            `)
    })
  })
})
