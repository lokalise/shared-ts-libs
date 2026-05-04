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

Registers a mock rule for the given contract. The `responseStatus` field is required and must match a key in the contract's `responsesByStatusCode` — it drives both which schema to use for validation and which response type to return.

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
| `ContractNoBody` | *(none)* |
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

## Type safety

`MockResponseParams<TContract>` is exported for cases where you need to type the params object separately:

```ts
import type { MockResponseParams } from '@lokalise/universal-testing-utils'

function mockUser(params: MockResponseParams<typeof getUserContract>) {
  return helper.mockResponse(getUserContract, params)
}
```
