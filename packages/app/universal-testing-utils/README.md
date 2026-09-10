# universal-testing-utils

Reusable testing utilities that are potentially relevant for both backend and frontend

## Helpers

| Helper | Mock server |
|---|---|
| `ApiContractMockttpHelper` | [mockttp](https://github.com/httptoolkit/mockttp) |
| `ApiContractMswHelper` | [msw](https://mswjs.io/) |

Both helpers work with contracts defined via `defineApiContract` from `@lokalise/api-contracts`.
The short names are aliases of the `ApiContract*` classes and behave identically.

## Table of contents

- [ApiContractMockttpHelper](#apicontractmockttphelper)
  - [Setup](#setup)
  - [mockResponse](#mockresponse)
  - [mockResponseWithImplementation](#mockresponsewithimplementation)
  - [Type safety](#type-safety)
- [ApiContractMswHelper](#apicontractmswhelper)
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
| `blobResponse(contentType)` | `responseBlob: string` |
| `noBodyResponse()` | *(none)* |
| `content` map with JSON and SSE entries | `responseJson` + `events` |

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

Contracts whose `content` map declares both `application/json` and `text/event-stream` serve either SSE or JSON depending on the request's `Accept` header. Both `events` and `responseJson` are required so the mock can respond to either mode.

```ts
const contract = defineApiContract({
  method: 'post',
  requestBodySchema: z.object({ name: z.string() }),
  pathResolver: () => '/jobs',
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': z.object({ id: z.string() }),
        'text/event-stream': sseBody({ completed: z.object({ totalCount: z.number() }) }),
      },
    },
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

`ApiContractMswHelper.response()` is the msw equivalent and returns the same wrapper.

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
