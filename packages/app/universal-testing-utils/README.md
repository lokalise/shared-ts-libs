# universal-testing-utils

Reusable testing utilities that are potentially relevant for both backend and frontend

## Table of contents

- [msw integration with API contracts](#msw-integration-with-api-contracts)
  - [Basic usage](#basic-usage)
  - [SSE contracts](#msw-sse-contracts)
  - [Dual-mode contracts](#msw-dual-mode-contracts)
  - [mockAnyResponse](#msw-mockanresponse)
  - [mockValidResponseWithAnyPath](#mockvalidresponsewithanypath)
  - [mockValidResponseWithImplementation](#mockvalidresponsewithimplementation)
  - [mockSseStream](#mockssestream)
- [mockttp integration with API contracts](#mockttp-integration-with-api-contracts)
  - [Basic usage](#basic-usage-1)
  - [Query params support](#query-params-support)
  - [SSE contracts](#mockttp-sse-contracts)
  - [Dual-mode contracts](#mockttp-dual-mode-contracts)
  - [mockAnyResponse](#mockttp-mockanresponse)
- [`formatSseResponse`](#formatSseResponse)

## msw integration with API contracts

`MswHelper` provides a unified `mockValidResponse` method that works with all contract types — REST, SSE, and dual-mode. The contract type determines which params are required:

- **REST contracts** — requires `responseBody`
- **SSE contracts** — requires `events`
- **Dual-mode contracts** — requires both `responseBody` and `events`

### Basic usage

```ts
import { buildRestContract } from '@lokalise/api-contracts'
import { sendByContract } from '@lokalise/frontend-http-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import wretch, { type Wretch } from 'wretch'
import { z } from 'zod/v4'
import { MswHelper } from '@lokalise/universal-testing-utils'

const RESPONSE_BODY_SCHEMA = z.object({ id: z.string() })
const PATH_PARAMS_SCHEMA = z.object({ userId: z.string() })

const postContractWithPathParams = buildRestContract({
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestBodySchema: z.object({ name: z.string() }),
    requestPathParamsSchema: PATH_PARAMS_SCHEMA,
    method: 'post',
    description: 'some description',
    responseSchemasByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const BASE_URL = 'http://localhost:8080'

describe('MswHelper', () => {
    const server = setupServer()
    const mswHelper = new MswHelper(BASE_URL)
    const wretchClient = wretch(BASE_URL)

    beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }) })
    afterEach(() => { server.resetHandlers() })
    afterAll(() => { server.close() })

    it('mocks POST request with path params', async () => {
        mswHelper.mockValidResponse(postContractWithPathParams, server, {
            pathParams: { userId: '3' },
            responseBody: { id: '2' },
        })

        const response = await sendByContract(wretchClient, postContractWithPathParams, {
            pathParams: { userId: '3' },
            body: { name: 'frf' },
        })

        expect(response).toEqual({ id: '2' })
    })
})
```

### msw SSE contracts

`mockValidResponse` works with SSE contracts built using `buildSseContract`. Pass `events` instead of `responseBody`. Event names and data shapes are fully type-safe.

```ts
import { buildSseContract } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

const sseContract = buildSseContract({
  method: 'get',
  pathResolver: () => '/events/stream',
  serverSentEventSchemas: {
    'item.updated': z.object({ items: z.array(z.object({ id: z.string() })) }),
    completed: z.object({ totalCount: z.number() }),
  },
})

// events is required, responseBody is not accepted
mswHelper.mockValidResponse(sseContract, server, {
  events: [
    { event: 'item.updated', data: { items: [{ id: '1' }] } },
    { event: 'completed', data: { totalCount: 1 } },
  ],
})

// With path params
mswHelper.mockValidResponse(sseContractWithPathParams, server, {
  pathParams: { userId: '42' },
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})

// With query params
mswHelper.mockValidResponse(sseContractWithQueryParams, server, {
  queryParams: { yearFrom: 2020 },
  events: [{ event: 'completed', data: { totalCount: 5 } }],
})
```

### msw dual-mode contracts

Dual-mode contracts (built with both `successResponseBodySchema` and `serverSentEventSchemas`) require both `responseBody` and `events`. A single handler is registered that routes on the `Accept` header:

- `Accept: text/event-stream` → returns SSE response
- Otherwise → returns JSON response

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

// Both responseBody and events are required
mswHelper.mockValidResponse(dualModeContract, server, {
  responseBody: { id: '1' },
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})
```

### msw mockAnyResponse

Mocks API responses with any response body, bypassing contract schema validation. Useful for testing error responses or edge cases. Works with REST and dual-mode contracts.

```ts
// REST — any response shape, no schema validation
mswHelper.mockAnyResponse(postContract, server, {
    responseBody: { error: 'Internal Server Error' },
    responseCode: 500,
})

// Dual-mode — unvalidated responseBody + typed events, routes on Accept header
mswHelper.mockAnyResponse(dualModeContract, server, {
    responseBody: { error: 'Something went wrong' },
    responseCode: 500,
    events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})
```

### mockValidResponseWithAnyPath

Wildcards all path params so the mock matches any path param values. Works with all contract types — the same overloads as `mockValidResponse` apply (REST requires `responseBody`, SSE requires `events`, dual-mode requires both), but `pathParams` is never needed.

```ts
// REST
mswHelper.mockValidResponseWithAnyPath(postContractWithPathParams, server, {
    responseBody: { id: '2' },
})

// SSE — matches any userId
mswHelper.mockValidResponseWithAnyPath(sseContractWithPathParams, server, {
    events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})

// Dual-mode — matches any userId
mswHelper.mockValidResponseWithAnyPath(dualModeContractWithPathParams, server, {
    responseBody: { id: '1' },
    events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})
```

### mockValidResponseWithImplementation

Custom handler for complex logic. The `handleRequest` callback receives the full MSW request info and returns the response body. Works with REST and dual-mode contracts.

```ts
// REST contract
mswHelper.mockValidResponseWithImplementation(postContractWithPathParams, server, {
    pathParams: { userId: ':userId' },
    handleRequest: async (requestInfo) => ({
        id: `id-${requestInfo.params.userId}`,
    }),
})

// Dual-mode contract — handleRequest for JSON, events for SSE
mswHelper.mockValidResponseWithImplementation(dualModeContract, server, {
    handleRequest: async (requestInfo) => {
        const body = await requestInfo.request.json()
        return { id: `impl-${body.name}` }
    },
    events: [{ event: 'completed', data: { totalCount: 1 } }],
})
```

#### Per-call status codes with `MswHelper.response()`

By default, all calls return the same status code (`params.responseCode` or `200`). To vary the status code per call, wrap the return value with `MswHelper.response(body, { status })`:

```ts
let callCount = 0
mswHelper.mockValidResponseWithImplementation(contract, server, {
    handleRequest: () => {
        callCount++
        if (callCount === 1) {
            return MswHelper.response({ error: 'Server error' }, { status: 500 })
        }
        return { id: 'success' } // plain return still works
    },
})
```

This is fully non-breaking — returning the body directly (without `MswHelper.response()`) continues to work as before.

Status code priority: `MswHelper.response({ status })` > `params.responseCode` > `200`.

### mockSseStream

Returns an `SseEventController` that lets you emit SSE events on demand during tests, instead of returning all events immediately. Works with SSE and dual-mode contracts.

```ts
// SSE contract — emit events on demand
const controller = mswHelper.mockSseStream(sseContract, server)

const response = await fetch('/events/stream')

controller.emit({ event: 'item.updated', data: { items: [{ id: '1' }] } })
controller.emit({ event: 'completed', data: { totalCount: 1 } })
controller.close()

// With path params
const controller = mswHelper.mockSseStream(sseContractWithPathParams, server, {
    pathParams: { userId: '42' },
})

// Dual-mode contract — SSE side streams on demand, JSON side uses responseBody
const controller = mswHelper.mockSseStream(dualModeContract, server, {
    responseBody: { id: '1' },
})

// JSON requests get immediate response
const jsonRes = await fetch('/events/dual', { headers: { accept: 'application/json' } })

// SSE requests get streaming response
const sseRes = await fetch('/events/dual', { headers: { accept: 'text/event-stream' } })
controller.emit({ event: 'completed', data: { totalCount: 42 } })
controller.close()
```

The controller is fully type-safe — event names and data shapes are inferred from the contract's `serverSentEventSchemas`.

## mockttp integration with API contracts

`MockttpHelper` provides the same unified `mockValidResponse` API. The contract type determines params:

- **REST contracts** — requires `responseBody`
- **SSE contracts** — requires `events`
- **Dual-mode contracts** — requires both `responseBody` and `events`

### Basic usage

```ts
import { buildRestContract } from '@lokalise/api-contracts'
import { getLocal } from 'mockttp'
import wretch, { type Wretch } from 'wretch'
import { z } from 'zod/v4'
import { MockttpHelper } from '@lokalise/universal-testing-utils'

const mockServer = getLocal()
const mockttpHelper = new MockttpHelper(mockServer)

// REST contract
await mockttpHelper.mockValidResponse(postContract, {
    responseBody: { id: '1' },
})

// With path params
await mockttpHelper.mockValidResponse(contractWithPathParams, {
    pathParams: { userId: '3' },
    responseBody: { id: '2' },
})
```

### Query params support

Both `mockValidResponse` and `mockAnyResponse` support `queryParams`. When provided, the mock server will only match requests that include the specified query parameters.

```ts
await mockttpHelper.mockValidResponse(getContractWithQueryParams, {
    queryParams: { yearFrom: 2020 },
    responseBody: { id: '1' },
})
```

### mockttp SSE contracts

```ts
await mockttpHelper.mockValidResponse(sseContract, {
  events: [
    { event: 'item.updated', data: { items: [{ id: '1' }] } },
    { event: 'completed', data: { totalCount: 1 } },
  ],
})

// With path params
await mockttpHelper.mockValidResponse(sseContractWithPathParams, {
  pathParams: { userId: '42' },
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})
```

### mockttp dual-mode contracts

Same as msw — a single handler routes on the `Accept` header:

```ts
await mockttpHelper.mockValidResponse(dualModeContract, {
  responseBody: { id: '1' },
  events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})
```

### mockttp mockAnyResponse

Mocks API responses with any response body, bypassing contract schema validation. Works with REST and dual-mode contracts.

```ts
// REST — any response shape
await mockttpHelper.mockAnyResponse(postContract, {
    responseBody: { error: 'Internal Server Error' },
    responseCode: 500,
})

// Dual-mode — unvalidated responseBody + typed events, routes on Accept header
await mockttpHelper.mockAnyResponse(dualModeContract, {
    responseBody: { error: 'Something went wrong' },
    responseCode: 500,
    events: [{ event: 'item.updated', data: { items: [{ id: '1' }] } }],
})
```

## `formatSseResponse`

A standalone helper exported for manual SSE response formatting:

```ts
import { formatSseResponse } from '@lokalise/universal-testing-utils'

const body = formatSseResponse([
  { event: 'item.updated', data: { items: [{ id: '1' }] } },
  { event: 'completed', data: { totalCount: 1 } },
])
// "event: item.updated\ndata: {\"items\":[{\"id\":\"1\"}]}\n\nevent: completed\ndata: {\"totalCount\":1}\n"
```
