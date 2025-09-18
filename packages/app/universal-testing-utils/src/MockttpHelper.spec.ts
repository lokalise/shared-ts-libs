import { sendByGetRoute, sendByPayloadRoute } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import {
  getContract,
  getContractWithPathParams,
  postContract,
  postContractWithPathParams,
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

  describe('mockValidResponse', () => {
    it('mocks POST request without path params', async () => {
      await mockttpHelper.mockValidResponse(postContract, {
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

    it('enforces POST contract', async () => {
      await mockttpHelper.mockValidResponse(postContract, {
        // @ts-expect-error this should fail - wrong property
        responseBody: { id: '1', wrong: 'wrong' },
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
      await mockttpHelper.mockValidResponse(postContractWithPathParams, {
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
      await mockttpHelper.mockValidResponse(getContract, {
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
      await mockttpHelper.mockValidResponse(getContractWithPathParams, {
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

  describe('mockAnyResponse', () => {
    it('mocks POST request without path params', async () => {
      await mockttpHelper.mockAnyResponse(postContract, {
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

    it('enforces POST contract', async () => {
      await mockttpHelper.mockAnyResponse(postContract, {
        responseBody: { id: '1', wrong: 'wrong' },
        responseCode: 500,
      })

      await expect(
        sendByPayloadRoute(wretchClient, postContract, {
          body: { name: 'frf' },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: {"id":"1","wrong":"wrong"}]`)
    })

    it('mocks POST request with path params', async () => {
      await mockttpHelper.mockAnyResponse(postContractWithPathParams, {
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
      await mockttpHelper.mockAnyResponse(getContract, {
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
      await mockttpHelper.mockAnyResponse(getContractWithPathParams, {
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
})
