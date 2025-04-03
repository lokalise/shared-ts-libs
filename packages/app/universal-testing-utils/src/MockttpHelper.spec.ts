import { sendByGetRoute, sendByPayloadRoute } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import {
  getContract,
  getContractWithPathParams,
  postContract,
  postContractWithPathParams,
} from '../test/testContracts.js'
import { MockttpHelper } from './MockttpHelper.js'

describe('MockttpHelper', () => {
  const mockServer = getLocal()
  const mockttpHelper = new MockttpHelper()
  let wretchClient: Wretch

  beforeEach(async () => {
    await mockServer.start()
    wretchClient = wretch(mockServer.url)
  })
  afterEach(() => mockServer.stop())

  describe('mockValidPayloadResponse', () => {
    it('mocks POST request without path params', async () => {
      await mockttpHelper.mockValidResponse(postContract, mockServer, {
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
      await mockttpHelper.mockValidResponse(postContractWithPathParams, mockServer, {
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
      await mockttpHelper.mockValidResponse(getContract, mockServer, {
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
      await mockttpHelper.mockValidResponse(getContractWithPathParams, mockServer, {
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
