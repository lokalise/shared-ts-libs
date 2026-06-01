# ApiContractMockttpHelper

Mock HTTP responses in [mockttp](https://github.com/httptoolkit/mockttp)-based tests using contracts defined with `defineApiContract` from `@lokalise/api-contracts`.

## Setup

```ts
import { getLocal } from 'mockttp'
import { ApiContractMockttpHelper } from '@lokalise/universal-testing-utils'

const mockServer = getLocal()
const helper = new ApiContractMockttpHelper(mockServer)

beforeEach(() => mockServer.start())
afterEach(() => mockServer.stop())
```

## mockResponse

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

### JSON response

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

### JSON response with path params

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

### No-body response

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

### SSE response

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

### Dual-mode response (SSE + JSON)

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

### Range and wildcard status keys

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

### How `StatusCodeBodyPair` works (type-level)

`MockResponseParams<TContract>` is a discriminated union on `responseStatus`. It has two branches:

- **`ExactStatusCodePairs`** — one member per exact numeric key in `responsesByStatusCode`. `responseStatus` is that literal number and the body fields come from the entry at that key.
- **`RangeStatusCodePairs`** — one member per wildcard key (`'1xx'`–`'5xx'`, `'default'`). `ExpandStatusRangeKey<K>` expands the key to its numeric union (e.g. `'2xx'` → `200|201|…|299`), then exact codes already covered by `ExactStatusCodePairs` are excluded via `Exclude` so the discriminated union stays unambiguous.

## Type safety

`MockResponseParams<TContract>` is exported for cases where you need to type the params object separately:

```ts
import type { MockResponseParams } from '@lokalise/universal-testing-utils'

function mockUser(params: MockResponseParams<typeof getUserContract>) {
  return helper.mockResponse(getUserContract, params)
}
```
