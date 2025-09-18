# universal-testing-utils

Reusable testing utilities that are potentially relevant for both backend and frontend

## msw integration with API contracts

### Basic usage

```ts
import { buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import { sendByGetRoute, sendByPayloadRoute } from '@lokalise/frontend-http-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import { z } from 'zod/v4'
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

    // use this approach when you need to implement custom logic within mocked endpoint,
    // e. g. call your own mock
    describe("mockValidResponseWithImplementation", () => {
        it("mocks POST request with custom implementation", async () => {
            const apiMock = vi.fn();

            mswHelper.mockValidResponseWithImplementation(postContractWithPathParams, server, {
                // setting this to :userId makes the params accessible by name within the callback
                pathParams: { userId: ':userId' },
                handleRequest: async (requestInfo) => {
                    apiMock(await requestInfo.request.json())

                    return {
                        id: `id-${requestInfo.params.userId}`,
                    }
                },
            })

            const response = await sendByPayloadRoute(
                wretchClient,
                postContractWithPathParams,
                {
                    pathParams: {
                        userId: "9",
                    },
                    body: { name: "test-name" },
                },
            );

            expect(apiMock).toHaveBeenCalledWith({
                name: "test-name",
            });
            expect(response).toMatchInlineSnapshot(`
              {
                "id": "9",
              }
            `);
        });
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

## mockttp integration with API contracts

API contract-based mock servers for testing.
Resolves path to be mocked based on the contract and passed path params, and automatically infers type for the response based on the contract schema

### Basic usage

```ts
import { buildPayloadRoute } from '@lokalise/api-contracts'
import { sendByPayloadRoute } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import { z } from 'zod'
import { MockttpHelper } from '@lokalise/universal-testing-utils'

const REQUEST_BODY_SCHEMA = z.object({
  name: z.string(),
})
const RESPONSE_BODY_SCHEMA = z.object({
  id: z.string(),
})
const PATH_PARAMS_SCHEMA = z.object({
  userId: z.string(),
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
    const mockttpHelper = new MockttpHelper(mockServer)
    let wretchClient: Wretch

    beforeEach(async () => {
        await mockServer.start()
        wretchClient = wretch(mockServer.url)
    })
    afterEach(() => mockServer.stop())

    describe('mockValidPayloadResponse', () => {
        it('mocks POST request without path params', async () => {
            await mockttpHelper.mockValidResponse(postContract, {
                responseBody: {id: '1'},
            })

            const response = await sendByPayloadRoute(wretchClient, postContract, {
                body: {name: 'frf'},
            })

            expect(response).toMatchInlineSnapshot(`
              {
                "id": "1",
              }
            `)
        })
    })

    describe('mockAnyResponse', () => {
        it('mocks error response with non-matching schema', async () => {
            // mockAnyResponse allows any response body, bypassing schema validation
            // Useful for testing error responses or edge cases
            await mockttpHelper.mockAnyResponse(postContract, {
                responseBody: { error: 'Internal Server Error', code: 'ERR_500' },
                responseCode: 500
            })

            const response = await sendByPayloadRoute(wretchClient, postContract, {
                body: {name: 'test'},
            })

            // Response will contain the error structure, not the expected schema
            expect(response).toMatchInlineSnapshot(`
              {
                "error": "Internal Server Error",
                "code": "ERR_500"
              }
            `)
        })

        it('mocks response with invalid schema for testing error handling', async () => {
            await mockttpHelper.mockAnyResponse(postContract, {
                responseBody: { unexpectedField: 'value', wrongType: 123 }
            })

            const response = await sendByPayloadRoute(wretchClient, postContract, {
                body: {name: 'test'},
            })

            expect(response).toMatchInlineSnapshot(`
              {
                "unexpectedField": "value",
                "wrongType": 123
              }
            `)
        })
    })
})
```

### mockAnyResponse

The `mockAnyResponse` method allows you to mock API responses with any response body, bypassing contract schema validation. This is particularly useful for:

- Testing error responses (4xx, 5xx status codes)
- Testing edge cases where the response doesn't match the expected schema
- Simulating malformed responses to test error handling

Unlike `mockValidResponse` which enforces schema validation, `mockAnyResponse` accepts any response body structure, making it ideal for testing how your application handles unexpected API responses.
