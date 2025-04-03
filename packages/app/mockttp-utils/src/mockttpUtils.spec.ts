import { buildPayloadRoute } from '@lokalise/api-contracts'
import { sendByPayloadRoute } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import { z } from 'zod'
import { mockValidPayloadResponse } from './mockttpUtils.js'

const REQUEST_BODY_SCHEMA = z.object({
  name: z.string(),
})
const RESPONSE_BODY_SCHEMA = z.object({
  id: z.string(),
})
const PATH_PARAMS_SCHEMA = z.object({
  userId: z.string(),
})

const contract = buildPayloadRoute({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestBodySchema: REQUEST_BODY_SCHEMA,
  method: 'post',
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/',
})

const contractWithPathParams = buildPayloadRoute({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestBodySchema: REQUEST_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  method: 'post',
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

describe('mockttpUtils', () => {
  const mockServer = getLocal()
  let wretchClient: Wretch

  beforeEach(async () => {
    await mockServer.start()
    wretchClient = wretch(mockServer.url)
  })
  afterEach(() => mockServer.stop())

  describe('mockValidPayloadResponse', () => {
    it('mocks POST request without path params', async () => {
      await mockValidPayloadResponse(contract, mockServer, {
        responseBody: { id: '1' },
      })

      const response = await sendByPayloadRoute(wretchClient, contract, {
        body: { name: 'frf' },
      })

      expect(response).toMatchInlineSnapshot(`
              {
                "id": "1",
              }
            `)
    })

    it('mocks POST request with path params', async () => {
      await mockValidPayloadResponse(contractWithPathParams, mockServer, {
        pathParams: { userId: '3' },
        responseBody: { id: '2' },
      })

      const response = await sendByPayloadRoute(wretchClient, contractWithPathParams, {
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
  })
})
