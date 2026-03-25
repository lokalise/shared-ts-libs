# backend-http-client

Opinionated HTTP client for the Node.js backend, built on [undici](https://undici.nodejs.org/).

## Building a client

```ts
import { buildClient } from '@lokalise/backend-http-client'

const client = buildClient('https://api.example.com', {
  // optional undici ClientOptions
})
```

Default client options: `keepAliveMaxTimeout: 300_000`, `keepAliveTimeout: 4000`.

## Contract-based requests

Use `sendByRouteContract` with contracts defined via `defineRouteContract` from `@lokalise/api-contracts`. All request and response types are inferred from the contract — including the response mode (JSON, text, blob, SSE, or no-body).

### JSON responses

```ts
import { defineRouteContract, ContractNoBody } from '@lokalise/api-contracts'
import { sendByRouteContract, buildClient } from '@lokalise/backend-http-client'
import { z } from 'zod/v4'

const getUser = defineRouteContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: { 200: z.object({ id: z.string(), name: z.string() }) },
})

const createUser = defineRouteContract({
  method: 'post',
  pathResolver: () => '/users',
  requestBodySchema: z.object({ name: z.string() }),
  responseSchemasByStatusCode: { 201: z.object({ id: z.string(), name: z.string() }) },
})

const deleteUser = defineRouteContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: { 204: ContractNoBody },
})

const client = buildClient('https://api.example.com')

// GET
const { result } = await sendByRouteContract(
  client,
  getUser,
  { pathParams: { userId: '1' } },
  { requestLabel: 'get-user' },
)
// result.body: { id: string; name: string }

// POST
await sendByRouteContract(
  client,
  createUser,
  { body: { name: 'Alice' } },
  { requestLabel: 'create-user' },
)

// DELETE — result.body is null on 204
await sendByRouteContract(
  client,
  deleteUser,
  { pathParams: { userId: '1' } },
  { requestLabel: 'delete-user' },
)
```

### Text and blob responses

```ts
import { textResponse, blobResponse } from '@lokalise/api-contracts'

const exportCsv = defineRouteContract({
  method: 'get',
  pathResolver: () => '/export.csv',
  responseSchemasByStatusCode: { 200: textResponse('text/csv') },
})

const downloadPhoto = defineRouteContract({
  method: 'get',
  pathResolver: () => '/photo.png',
  responseSchemasByStatusCode: { 200: blobResponse('image/png') },
})

const { result: csv } = await sendByRouteContract(client, exportCsv, {}, { requestLabel: 'export' })
// csv.body: string

const { result: photo } = await sendByRouteContract(client, downloadPhoto, {}, { requestLabel: 'photo' })
// photo.body: Blob
```

### SSE responses

Contracts using `sseResponse()` return an `AsyncIterable` of typed events. Event data is validated against the per-event Zod schema from the contract.

```ts
import { sseResponse } from '@lokalise/api-contracts'

const notifications = defineRouteContract({
  method: 'get',
  pathResolver: () => '/notifications/stream',
  responseSchemasByStatusCode: {
    200: sseResponse({
      notification: z.object({ id: z.string(), message: z.string() }),
    }),
  },
})

const stream = await sendByRouteContract(
  client,
  notifications,
  {},
  { requestLabel: 'notifications' },
)

for await (const event of stream) {
  // event: { event: 'notification'; data: { id: string; message: string } }
  console.log(event.data.message)
}
```

### Dual-mode contracts

When a contract supports both SSE and JSON responses via `anyOfResponses`, pass `streaming: true` for the SSE stream or `streaming: false` for the JSON response. TypeScript enforces that `streaming` is required for these contracts and infers the correct return type for each.

```ts
import { anyOfResponses, sseResponse } from '@lokalise/api-contracts'

const chatCompletion = defineRouteContract({
  method: 'post',
  pathResolver: () => '/chat/completions',
  requestBodySchema: z.object({ message: z.string() }),
  responseSchemasByStatusCode: {
    200: anyOfResponses([
      sseResponse({ chunk: z.object({ delta: z.string() }) }),
      z.object({ text: z.string() }),
    ]),
  },
})

// Streaming — returns AsyncIterable
const stream = await sendByRouteContract(
  client,
  chatCompletion,
  { body: { message: 'hi' }, streaming: true },
  { requestLabel: 'chat' },
)

// JSON — returns typed result
const { result } = await sendByRouteContract(
  client,
  chatCompletion,
  { body: { message: 'hi' }, streaming: false },
  { requestLabel: 'chat' },
)
```

### Params

| Field | Description |
|---|---|
| `pathParams` | Path parameters — type inferred from `requestPathParamsSchema` |
| `body` | Request body — present only for POST/PUT/PATCH; type inferred from `requestBodySchema` |
| `queryParams` | Query parameters — type inferred from `requestQuerySchema` |
| `headers` | Request headers — type inferred from `requestHeaderSchema` |
| `pathPrefix` | Optional prefix prepended to the resolved path (e.g. `'api/v2'`) |
| `streaming` | Required (boolean) only for dual-mode contracts (`anyOfResponses` with SSE + JSON) |

### Options

| Field | Default | Description |
|---|---|---|
| `requestLabel` | — | Included in errors for context |
| `validateResponse` | `true` | Validate JSON response body against the contract schema |
| `throwOnError` | `true` | Throw on non-2xx responses instead of returning `error` |
| `timeout` | `30000` | Request timeout in ms (`undefined` = no timeout) |
| `retryConfig` | no retry | `{ maxAttempts, statusCodesToRetry?, delayResolver?, retryOnTimeout }` |
| `reqContext` | — | Request context object (e.g. `{ reqId }`) |
| `disableKeepAlive` | `false` | Disable keep-alive for this request |

## Either

All send methods return `Either<Error, Result>`:

- `result` is always defined on success
- `error` is defined (and `result` undefined) on failure when `throwOnError: false`

```ts
const { result, error } = await sendByRouteContract(
  client,
  contract,
  params,
  { throwOnError: false, requestLabel: 'test' },
)

if (error) {
  // handle error
} else {
  console.log(result.body)
}
```

## Low-level methods

For cases where you don't have a contract, the following path-based methods are available:

| Method | Description |
|---|---|
| `sendGet(client, path, options)` | GET request |
| `sendPost(client, path, body, options)` | POST request |
| `sendPut(client, path, body, options)` | PUT request |
| `sendPutBinary(client, path, body, options)` | PUT with binary body |
| `sendPatch(client, path, body, options)` | PATCH request |
| `sendDelete(client, path, options)` | DELETE request |
| `sendGetWithStreamedResponse(client, path, options)` | GET returning a `Readable` stream |

---

## Deprecated API

> The functions below are **deprecated**. Use `sendByRouteContract` instead.

| Deprecated | Replacement |
|---|---|
| `sendByContract` | `sendByRouteContract` |
| `sendByContractWithStreamedResponse` | `sendByRouteContract` with `sseResponse` contract |
| `sendByGetRoute` | `sendByRouteContract` |
| `sendByDeleteRoute` | `sendByRouteContract` |
| `sendByPayloadRoute` | `sendByRouteContract` |
