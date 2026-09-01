# universal-testing-utils

Reusable testing utilities that are potentially relevant for both backend and frontend

## Compatibility matrix

| Helper | Contract API |
|---|---|
| `ApiContractMockttpHelper` | `defineApiContract` |
| `ApiContractMswHelper` | `defineApiContract` |
| `MswHelper` | `buildRestContract` / `buildSseContract` |
| `MockttpHelper` *(deprecated)* | `buildRestContract` / `buildSseContract` |

## Table of contents

- [ApiContractMockttpHelper](#apicontractmockttphelper)
  - [Setup](#setup)
  - [mockResponse](#mockresponse)
  - [mockResponseWithImplementation](#mockresponsewithimplementation)
  - [Type safety](#type-safety)
- [ApiContractMswHelper](#apicontractmswhelper)
- [msw integration with API contracts](#msw-integration-with-api-contracts)
  - [Basic usage](#basic-usage)
  - [SSE contracts](#msw-sse-contracts)
  - [Dual-mode contracts](#msw-dual-mode-contracts)
  - [mockAnyResponse](#msw-mockanresponse)
  - [mockValidResponseWithAnyPath](#mockvalidresponsewithanypath)
  - [mockValidResponseWithImplementation](#mockvalidresponsewithimplementation)
  - [mockSseStream](#mockssestream)
- [mockttp integration with API contracts (deprecated)](#mockttp-integration-with-api-contracts-deprecated)
  - [Basic usage](#basic-usage-1)
  - [Query params support](#query-params-support)
  - [SSE contracts](#mockttp-sse-contracts)
  - [Dual-mode contracts](#mockttp-dual-mode-contracts)
  - [mockAnyResponse](#mockttp-mockanresponse)
- [`formatSseResponse`](#formatSseResponse)

## ApiContractMockttpHelper

Mock HTTP responses in [mockttp](https://github.com/httptoolkit/mockttp)-based tests using contracts defined with `defineApiContract` from `@lokalise/api-contracts`.

### Setup

```ts
import { getLocal } from 'mockttp'
import { ApiContractMockttpHelper } from '@lokalise/universal-testing-utils'

const mockServer = getLocal()
const helper = new ApiContractMockttpHelper(mockServer)

beforeEach(() => mockServer.start())
afterEach(() => mockServer.stop())
```

### mockResponse

Registers a mock rule for the given contract. `responseStatus` is the concrete numeric HTTP status code the mock will send (e.g. `201`, `404`). It also controls which schema is used: the helper looks up the contract entry with **exact → range → `'default'`** precedence, so a contract with only a `'2xx'` key accepts any `responseStatus` in 200–299.

```ts
await helper.mockResponse(contract, params)
```

`params` is a discriminated union on `responseStatus`. The required body fields are inferred from the contract's response type for that status code:

| Response type | Required field |
|---|---|
| `ZodType` (JSON) | `responseJson: z.input<T>` |
| `sseResponse(schemas)` | `events: { event: string; data: unknown }[]` |
| `textResponse(contentType)` | `responseText: string` |
| `blobResponse(contentType)` | `responseBlob: string` |
| `ContractNoBody` / `noBodyResponse()` | *(none)* |
| `anyOfResponses([sse, json])` | `responseJson` + `events` |

Path params are required when the contract declares `requestPathParamsSchema`, and optional otherwise.

#### JSON response

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/users',
  responsesByStatusCode: { 200: z.object({ id: z.string() }) },
})

await helper.mockResponse(contract, {
  responseStatus: 200,
  responseJson: { id: '1' },
})
```

The response body is validated and stripped through the contract's Zod schema before being sent.

#### JSON response with path params

```ts
const contract = defineApiContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 200: z.object({ id: z.string() }) },
})

await helper.mockResponse(contract, {
  pathParams: { userId: '42' },
  responseStatus: 200,
  responseJson: { id: '42' },
})
```

#### No-body response

```ts
const contract = defineApiContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 204: ContractNoBody },
})

await helper.mockResponse(contract, {
  pathParams: { userId: '1' },
  responseStatus: 204,
})
```

#### SSE response

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/events/stream',
  responsesByStatusCode: {
    200: sseResponse({ 'item.updated': z.object({ id: z.string() }), completed: z.object({ totalCount: z.number() }) }),
  },
})

await helper.mockResponse(contract, {
  responseStatus: 200,
  events: [
    { event: 'item.updated', data: { id: '1' } },
    { event: 'completed', data: { totalCount: 1 } },
  ],
})
```

#### Dual-mode response (SSE + JSON)

Contracts using `anyOfResponses([sseResponse(...), jsonSchema])` serve either SSE or JSON depending on the request's `Accept` header. Both `events` and `responseJson` are required so the mock can respond to either mode.

```ts
const contract = defineApiContract({
  method: 'post',
  requestBodySchema: z.object({ name: z.string() }),
  pathResolver: () => '/jobs',
  responsesByStatusCode: {
    200: anyOfResponses([sseResponse({ completed: z.object({ totalCount: z.number() }) }), z.object({ id: z.string() })]),
  },
})

await helper.mockResponse(contract, {
  responseStatus: 200,
  responseJson: { id: '1' },
  events: [{ event: 'completed', data: { totalCount: 1 } }],
})
```

- Requests with `Accept: text/event-stream` receive the SSE stream.
- All other requests receive the JSON body.

#### Selecting a content type

When a status code declares multiple content types, pass `contentType` to pin the mock to one specific entry — only that entry's body field is required, and the response always uses that content type (no `Accept` negotiation). This is the only way to mock an entry that negotiation would never pick, e.g. a second JSON content type or a blob entry that sits next to a JSON one.

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/report',
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': z.object({ id: z.string() }),
        'application/problem+json': z.object({ title: z.string(), detail: z.string() }),
      },
    },
  },
})

await helper.mockResponse(contract, {
  responseStatus: 200,
  contentType: 'application/problem+json',
  responseJson: { title: 'Invalid', detail: 'Something went wrong' },
})
```

Without `contentType`, the existing behavior applies: SSE is served when the request negotiates it via `Accept`, otherwise the first JSON entry wins, then blob.

#### Range and wildcard status keys

Contracts may use range keys (`'1xx'`–`'5xx'`) or `'default'` in `responsesByStatusCode` instead of exact codes. Pass any concrete numeric code covered by that range as `responseStatus`; the helper resolves the contract entry using the same **exact → range → `'default'`** precedence as the runtime client.

**Range key only** — `responseStatus` accepts any code in 200–299:

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/items',
  responsesByStatusCode: { '2xx': z.object({ id: z.string() }) },
})

await helper.mockResponse(contract, {
  responseStatus: 201,          // any 2xx code is valid
  responseJson: { id: '1' },
})
```

**`'default'` catch-all** — `responseStatus` accepts any `HttpStatusCode`:

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/items',
  responsesByStatusCode: { default: z.object({ id: z.string() }) },
})

await helper.mockResponse(contract, {
  responseStatus: 200,
  responseJson: { id: '1' },
})
```

**Exact key takes priority** — when both `200` and `'2xx'` are defined, `responseStatus: 200` uses the exact entry and `responseStatus: 201` falls back to the range entry:

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/items',
  responsesByStatusCode: {
    200: z.object({ id: z.string() }),
    '2xx': z.object({ id: z.string(), created: z.literal(true) }),
  },
})

await helper.mockResponse(contract, { responseStatus: 200, responseJson: { id: '1' } })
await helper.mockResponse(contract, { responseStatus: 201, responseJson: { id: '2', created: true } })
```

#### How `StatusCodeBodyPair` works (type-level)

`MockResponseParams<TContract>` is a discriminated union on `responseStatus`. It has two branches:

- **`ExactStatusCodePairs`** — one member per exact numeric key in `responsesByStatusCode`. `responseStatus` is that literal number and the body fields come from the entry at that key.
- **`RangeStatusCodePairs`** — one member per wildcard key (`'1xx'`–`'5xx'`, `'default'`). `ExpandStatusRangeKey<K>` expands the key to its numeric union (e.g. `'2xx'` → `200|201|…|299`), then exact codes already covered by `ExactStatusCodePairs` are excluded via `Exclude` so the discriminated union stays unambiguous.

### mockResponseWithImplementation

`mockResponse` takes a fixed body. When the response has to depend on what the caller sent, use `mockResponseWithImplementation` and return the body from a handler.

`responseStatus` still selects the contract entry, which is what types `handleRequest`'s return value and supplies the Zod schema the result is validated against. The handler's request argument is typed from the contract too, so `request.body.getJson()` (mockttp) and `request.json()` (msw) hand back the output of the contract's `requestBodySchema` rather than `unknown`. Only JSON entries are addressable this way: SSE and blob responses stay static, via `mockResponse`.

```ts
// mockttp: the handler receives the mockttp CompletedRequest
await helper.mockResponseWithImplementation(postUserContract, {
  responseStatus: 200,
  handleRequest: async (request) => {
    const body = await request.body.getJson() // typed by requestBodySchema
    return { id: `id-${body.name}` }
  },
})

// msw: the handler receives the msw request info
helper.mockResponseWithImplementation(postUserContract, {
  responseStatus: 200,
  handleRequest: async ({ request }) => {
    const body = await request.json() // typed by requestBodySchema
    return { id: `id-${body.name}` }
  },
})

// with path params
await helper.mockResponseWithImplementation(getUserContract, {
  pathParams: { userId: '7' },
  responseStatus: 200,
  handleRequest: (request) => ({ id: request.path.split('/').pop() ?? '' }),
})
```

#### Picking the media type with `contentType`

The response goes out under the media type the contract declares it for, so an `application/problem+json` entry is served as `application/problem+json` rather than `application/json`. When a status entry declares more than one JSON media type, pass `contentType` to say which one the handler is answering with; the selected descriptor then types the handler's result:

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/items',
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': z.object({ id: z.string() }),
        'application/problem+json': z.object({ title: z.string(), detail: z.string() }),
      },
    },
  },
})

await helper.mockResponseWithImplementation(contract, {
  responseStatus: 200,
  contentType: 'application/problem+json',
  handleRequest: () => ({ title: 'Invalid', detail: 'Something went wrong' }),
})
```

`contentType` is required whenever the choice would be ambiguous and optional otherwise. It only names JSON entries: pointing it at an SSE or blob descriptor throws, as does a status entry with no JSON body at all. A status that also declares `text/event-stream` still serves JSON here, but a request negotiating the SSE branch through `Accept` gets a 406 rather than a JSON body it cannot read. Mock that branch with `mockResponse`.

#### Per-call status codes with `response()`

By default every call replies with `responseStatus`. To vary it per call, wrap the returned body with the helper's static `response()`:

```ts
let callCount = 0
await helper.mockResponseWithImplementation(getUserContract, {
  responseStatus: 200,
  handleRequest: () => {
    callCount++
    if (callCount === 1) {
      return ApiContractMockttpHelper.response({ message: 'nope' }, { status: 404 })
    }
    return { id: 'second' } // a plain body still replies with responseStatus
  },
})
```

An overridden status selects its own contract entry, so the wrapped body is validated against the schema declared for the status actually being sent: `{ message: 'nope' }` above has to satisfy the contract's `'4xx'` entry, not its `200` one. Overriding to a status the contract does not declare is an error.

`ApiContractMswHelper.response()` is the msw equivalent, and both share the wrapper with `MswHelper.response()`.

Status code priority: `response({ status })` > `responseStatus`.

#### When a handler fails

mockttp and msw both turn a throwing route callback into a bare 500, which reaches the test as a client-side parse failure with the cause nowhere in sight. A handler that throws, or that returns a body the contract schema rejects, instead produces a 500 whose body carries the reason, logged through `console.error` alongside the contract it came from:

```
[ApiContractMockttpHelper.mockResponseWithImplementation] POST /users/:userId: ZodError: ...
```

Setup-time problems (an unmapped status, a status with no JSON body, an ambiguous or unmatched `contentType`) still throw from `mockResponseWithImplementation` itself, where the stack points at the test that set the mock up.

### Type safety

`MockResponseParams<TContract>` is exported for cases where you need to type the params object separately:

```ts
import type { MockResponseParams } from '@lokalise/universal-testing-utils'

function mockUser(params: MockResponseParams<typeof getUserContract>) {
  return helper.mockResponse(getUserContract, params)
}
```

## ApiContractMswHelper

The [msw](https://mswjs.io/)-based counterpart to [`ApiContractMockttpHelper`](#apicontractmockttphelper) for contracts defined with `defineApiContract`. `mockResponse` accepts the same `MockResponseParams` and follows the same rules — response entry resolution with **exact → range → `'default'`** precedence, Zod validation of `responseJson`, SSE/JSON negotiation via the `Accept` header, blob and no-body entries. The only differences are the setup (an msw `SetupServer` plus a base URL, since msw matches absolute URLs) and that `mockResponse` is synchronous.

```ts
import { setupServer } from 'msw/node'
import { ApiContractMswHelper } from '@lokalise/universal-testing-utils'

const server = setupServer()
const helper = new ApiContractMswHelper(server, 'http://localhost:8080')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

helper.mockResponse(contract, {
  responseStatus: 200,
  responseJson: { id: '1' },
})
```

[`mockResponseWithImplementation`](#mockresponsewithimplementation) and the static `response()` are available here too, with `handleRequest` receiving msw's request info instead of a mockttp `CompletedRequest`.

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

## mockttp integration with API contracts (deprecated)

> **Deprecated.** Use [`ApiContractMockttpHelper`](#apicontractmockttphelper) instead, which works with the new `defineApiContract`-based contracts.

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
