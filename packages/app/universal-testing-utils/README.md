# universal-testing-utils

Reusable testing utilities that are potentially relevant for both backend and frontend

## msw integration with API contracts

## Basic usage

```ts
import { buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import { sendByGetRoute, sendByPayloadRoute } from '@lokalise/frontend-http-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import { z } from 'zod'
import { MswHelper } from '@lokalise/universal-testing-utils'

const REQUEST_BODY_SCHEMA = z.object({
    name: z.string(),
})
const RESPONSE_BODY_SCHEMA = z.object({
    id: z.string(),
})
const PATH_PARAMS_SCHEMA = z.object({
    userId: z.string(),
})

const postContractWithPathParams = buildPayloadRoute({
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
    })

    describe('mockValidResponseWithAnyPath', () => {
        it('mocks POST request with path params', async () => {
            // you don't need specify any path params, they automatically are set to * 
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
    })

    describe('mockAnyResponse', () => {
        it('mocks POST request without path params', async () => {
            mswHelper.mockAnyResponse(postContract, server, {
                // you can specify any response, regardless of what contract expects
                responseBody: { wrongId: '1' },
            })

            const response = await wretchClient.post({ name: 'frf' }, mapRouteToPath(postContract))

            expect(await response.json()).toMatchInlineSnapshot(`
              {
                "wrongId": "1",
              }
            `)
        })
    })
})
```
