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
import { mockValidResponse } from '@lokalise/universal-testing-utils'

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

describe('mswUtils', () => {
    const server = setupServer()
    let wretchClient: Wretch

    beforeEach(() => {
        server.listen({onUnhandledRequest: 'error'})
        wretchClient = wretch(BASE_URL)
    })
    afterEach(() => {
        server.resetHandlers()
    })
    afterAll(() => {
        server.close()
    })

    describe('mockValidPayloadResponse', () => {
        it('mocks POST request with path params', async () => {
            mockValidResponse(postContractWithPathParams, server, {
                baseUrl: BASE_URL,
                pathParams: {userId: '3'},
                responseBody: {id: '2'},
            })

            const response = await sendByPayloadRoute(wretchClient, postContractWithPathParams, {
                pathParams: {
                    userId: '3',
                },
                body: {name: 'frf'},
            })

            expect(response).toMatchInlineSnapshot(`
              {
                "id": "2",
              }
            `)
        })
    })
})
```
