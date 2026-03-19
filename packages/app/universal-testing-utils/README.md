# universal-testing-utils

Reusable testing utilities that are potentially relevant for both backend and frontend

## Table of contents

- [msw integration with API contracts](#msw-integration-with-api-contracts)
  - [Basic usage](#basic-usage)
  - [mockAnyResponse](#msw-mockanresponse)
  - [SSE mock support](#msw-sse-mock-support)
- [mockttp integration with API contracts](#mockttp-integration-with-api-contracts)
  - [Basic usage](#basic-usage-1)
  - [Query params support](#query-params-support)
  - [mockAnyResponse](#mockttp-mockanresponse)
  - [SSE mock support](#mockttp-sse-mock-support)
- [Dual-mode contracts](#dual-mode-contracts)
- [`formatSseResponse`](#formatSseResponse)

## msw integration with API contracts

### Basic usage

```ts
import { buildRestContract } from '@lokalise/api-contracts'
import { sendByContract } from '@lokalise/frontend-http-client'
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

const postContractWithPathParams = buildRestContract({
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
    })

    describe('mockValidResponseWithAnyPath', () => {
        it('mocks POST request with path params', async () => {
            // you don't need specify any path params, they automatically are set to *
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

            const response = await sendByContract(
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
})
```

### msw mockAnyResponse

The `mockAnyResponse` method allows you to mock API responses with any response body, bypassing contract schema validation. This is particularly useful for:

- Testing error responses (4xx, 5xx status codes)
- Testing edge cases where the response doesn't match the expected schema
- Simulating malformed responses to test error handling

Unlike `mockValidResponse` which enforces schema validation, `mockAnyResponse` accepts any response body structure, making it ideal for testing how your application handles unexpected API responses.

```ts
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
```

### msw SSE mock support

`MswHelper` supports mocking SSE (Server-Sent Events) endpoints via `mockSseResponse`. This method works with `SSEContractDefinition` and `DualModeContractDefinition` contracts built using `buildSseContract` from `@lokalise/api-contracts`.

Event names and data shapes are fully type-safe — typing `event: 'item.updated'` narrows the `data` field to the matching schema's input type.

> **Note:** When used with a dual-mode contract, `mockSseResponse` only responds to requests with `Accept: text/event-stream`. Requests without this header will pass through to other handlers. See [Dual-mode contracts](#dual-mode-contracts) for details.

```ts
import { buildSseContract } from '@lokalise/api-contracts'
import { setupServer } from 'msw/node'
import { z } from 'zod/v4'
import { MswHelper } from '@lokalise/universal-testing-utils'

const sseContract = buildSseContract({
  method: 'get',
  pathResolver: () => '/events/stream',
  serverSentEventSchemas: {
    'item.updated': z.object({ items: z.array(z.object({ id: z.string() })) }),
    completed: z.object({ totalCount: z.number() }),
  },
})

const sseContractWithPathParams = buildSseContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: (params) => `/users/${params.userId}/events`,
  serverSentEventSchemas: {
    'item.updated': z.object({ items: z.array(z.object({ id: z.string() })) }),
    completed: z.object({ totalCount: z.number() }),
  },
})

const sseContractWithQueryParams = buildSseContract({
  method: 'get',
  pathResolver: () => '/events/stream',
  requestQuerySchema: z.object({ yearFrom: z.coerce.number() }),
  serverSentEventSchemas: {
    'item.updated': z.object({ items: z.array(z.object({ id: z.string() })) }),
    completed: z.object({ totalCount: z.number() }),
  },
})

const server = setupServer()
const mswHelper = new MswHelper('http://localhost:8080')

// No path params
mswHelper.mockSseResponse(sseContract, server, {
  events: [
    { event: 'item.updated', data: { items: [{ id: '1' }] } },
    { event: 'completed', data: { totalCount: 1 } },
  ],
})

// With path params
mswHelper.mockSseResponse(sseContractWithPathParams, server, {
  pathParams: { userId: '42' },
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})

// With query params
mswHelper.mockSseResponse(sseContractWithQueryParams, server, {
  queryParams: { yearFrom: 2020 },
  events: [{ event: 'completed', data: { totalCount: 5 } }],
})

// Custom response code
mswHelper.mockSseResponse(sseContract, server, {
  responseCode: 201,
  events: [{ event: 'completed', data: { totalCount: 0 } }],
})
```

## mockttp integration with API contracts

API contract-based mock servers for testing.
Resolves path to be mocked based on the contract and passed path params, and automatically infers type for the response based on the contract schema

### Basic usage

```ts
import { buildRestContract } from '@lokalise/api-contracts'
import { sendByContract } from '@lokalise/frontend-http-client'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import { z } from 'zod/v4'
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
const QUERY_PARAMS_SCHEMA = z.object({
  yearFrom: z.coerce.number(),
})

const postContract = buildRestContract({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestBodySchema: REQUEST_BODY_SCHEMA,
  method: 'post',
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/',
})

const contractWithPathParams = buildRestContract({
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

const getContractWithQueryParams = buildRestContract({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
  description: 'some description',
  responseSchemasByStatusCode: {
    200: RESPONSE_BODY_SCHEMA,
  },
  pathResolver: () => '/items',
})

const getContractWithPathAndQueryParams = buildRestContract({
  successResponseBodySchema: RESPONSE_BODY_SCHEMA,
  requestPathParamsSchema: PATH_PARAMS_SCHEMA,
  requestQuerySchema: QUERY_PARAMS_SCHEMA,
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

    describe('mockValidResponse', () => {
        it('mocks POST request without path params', async () => {
            await mockttpHelper.mockValidResponse(postContract, {
                responseBody: {id: '1'},
            })

            const response = await sendByContract(wretchClient, postContract, {
                body: {name: 'frf'},
            })

            expect(response).toMatchInlineSnapshot(`
              {
                "id": "1",
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
})
```

### Query params support

Both `mockValidResponse` and `mockAnyResponse` support `queryParams`. When provided, the mock server will only match requests that include the specified query parameters. The `queryParams` type is inferred from the contract's `requestQuerySchema`, so you pass the same values as you would to `frontend-http-client` (strings, numbers, etc.).

### mockttp mockAnyResponse

The `mockAnyResponse` method allows you to mock API responses with any response body, bypassing contract schema validation. This is particularly useful for:

- Testing error responses (4xx, 5xx status codes)
- Testing edge cases where the response doesn't match the expected schema
- Simulating malformed responses to test error handling

Unlike `mockValidResponse` which enforces schema validation, `mockAnyResponse` accepts any response body structure, making it ideal for testing how your application handles unexpected API responses.

```ts
await mockttpHelper.mockAnyResponse(postContract, {
    responseBody: { error: 'Internal Server Error', code: 'ERR_500' },
    responseCode: 500
})

const response = await wretchClient
    .post({ name: 'test' }, '/')
    .json()

expect(response).toMatchInlineSnapshot(`
  {
    "error": "Internal Server Error",
    "code": "ERR_500"
  }
`)
```

### mockttp SSE mock support

`MockttpHelper` supports mocking SSE (Server-Sent Events) endpoints via `mockSseResponse`. This method works with `SSEContractDefinition` and `DualModeContractDefinition` contracts built using `buildSseContract` from `@lokalise/api-contracts`.

Event names and data shapes are fully type-safe — typing `event: 'item.updated'` narrows the `data` field to the matching schema's input type.

> **Note:** When used with a dual-mode contract, `mockSseResponse` only responds to requests with `Accept: text/event-stream`. Similarly, `mockValidResponse` only responds when Accept does **not** include `text/event-stream`. See [Dual-mode contracts](#dual-mode-contracts) for details.

```ts
import { buildSseContract } from '@lokalise/api-contracts'
import { getLocal } from 'mockttp'
import { z } from 'zod/v4'
import { MockttpHelper } from '@lokalise/universal-testing-utils'

const sseContract = buildSseContract({
  method: 'get',
  pathResolver: () => '/events/stream',
  serverSentEventSchemas: {
    'item.updated': z.object({ items: z.array(z.object({ id: z.string() })) }),
    completed: z.object({ totalCount: z.number() }),
  },
})

const sseContractWithPathParams = buildSseContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: (params) => `/users/${params.userId}/events`,
  serverSentEventSchemas: {
    'item.updated': z.object({ items: z.array(z.object({ id: z.string() })) }),
    completed: z.object({ totalCount: z.number() }),
  },
})

const mockServer = getLocal()
const mockttpHelper = new MockttpHelper(mockServer)

// No path params — pathParams is not required
await mockttpHelper.mockSseResponse(sseContract, {
  events: [
    { event: 'item.updated', data: { items: [{ id: '1' }] } }, // fully typed
    { event: 'completed', data: { totalCount: 1 } },
  ],
})

// With path params — pathParams is required and typed
await mockttpHelper.mockSseResponse(sseContractWithPathParams, {
  pathParams: { userId: '42' },
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})

// Custom response code
await mockttpHelper.mockSseResponse(sseContract, {
  responseCode: 201,
  events: [{ event: 'completed', data: { totalCount: 0 } }],
})
```

## Dual-mode contracts

Dual-mode contracts (built with `successResponseBodySchema`) support both JSON and SSE responses from the same endpoint. The response mode is determined by the client's `Accept` header.

When a dual-mode contract is used with `mockValidResponse` or `mockSseResponse`, the handlers automatically check the `Accept` header:

- `mockValidResponse` responds only when Accept does **not** include `text/event-stream`
- `mockSseResponse` responds only when Accept includes `text/event-stream`

This means both mocks can coexist on the same endpoint — each test only needs to mock the mode it's testing.

```ts
const dualModeContract = buildSseContract({
  method: 'post',
  pathResolver: () => '/events/dual',
  requestBodySchema: z.object({ name: z.string() }),
  successResponseBodySchema: z.object({ id: z.string() }),
  serverSentEventSchemas: {
    'item.updated': z.object({ items: z.array(z.object({ id: z.string() })) }),
  },
})

// Mock only the JSON mode — requests with Accept: text/event-stream will pass through
mswHelper.mockValidResponse(dualModeContract, server, {
  responseBody: { id: '1' },
})

// Mock only the SSE mode — requests without Accept: text/event-stream will pass through
mswHelper.mockSseResponse(dualModeContract, server, {
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})

// Or mock both modes simultaneously
mswHelper.mockValidResponse(dualModeContract, server, {
  responseBody: { id: '1' },
})
mswHelper.mockSseResponse(dualModeContract, server, {
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})
```

The same behavior applies to `MockttpHelper`:

```ts
// Mock only JSON mode
await mockttpHelper.mockValidResponse(dualModeContract, {
  responseBody: { id: '1' },
})

// Mock only SSE mode
await mockttpHelper.mockSseResponse(dualModeContract, {
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})
```

For non-dual-mode contracts (regular REST or SSE-only), the `Accept` header is not checked — the handler always responds regardless of the header.

## `formatSseResponse`

A standalone helper is also exported for manual SSE response formatting:

```ts
import { formatSseResponse } from '@lokalise/universal-testing-utils'

const body = formatSseResponse([
  { event: 'item.updated', data: { items: [{ id: '1' }] } },
  { event: 'completed', data: { totalCount: 1 } },
])
// "event: item.updated\ndata: {\"items\":[{\"id\":\"1\"}]}\n\nevent: completed\ndata: {\"totalCount\":1}\n"
```
