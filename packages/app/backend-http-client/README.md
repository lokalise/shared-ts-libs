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

Use `sendByRouteContract` with contracts defined via `defineRouteContract` from `@lokalise/api-contracts`. All request and response types are inferred from the contract.

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

// GET — body absent from params, typed from contract
const getResult = await sendByRouteContract(
  client,
  getUser,
  { pathParams: { userId: '1' } },
  { requestLabel: 'get-user' },
)
// getResult.result.body: { id: string; name: string }

// POST — body required by contract type
const createResult = await sendByRouteContract(
  client,
  createUser,
  { body: { name: 'Alice' } },
  { requestLabel: 'create-user' },
)

// DELETE — returns null on 204
const deleteResult = await sendByRouteContract(
  client,
  deleteUser,
  { pathParams: { userId: '1' } },
  { requestLabel: 'delete-user' },
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

### Options

| Field | Default | Description |
|---|---|---|
| `requestLabel` | — | Included in errors for context |
| `validateResponse` | `true` | Validate response body against the contract schema |
| `throwOnError` | `true` | Throw on non-2xx responses instead of returning `error` |
| `timeout` | `30000` | Request timeout in ms (`undefined` = no timeout) |
| `retryConfig` | no retry | `{ maxAttempts, statusCodesToRetry?, delayResolver?, retryOnTimeout }` |
| `reqContext` | — | Request context object (e.g. `{ reqId }`) |
| `safeParseJson` | `false` | Catch JSON parse errors instead of throwing |
| `blobResponseBody` | `false` | Return response body as Blob |
| `disableKeepAlive` | `false` | Disable keep-alive for this request |

### Streaming responses

Use `sendByRouteContractWithStreamedResponse` for large response bodies that should not be loaded into memory:

```ts
import { sendByRouteContractWithStreamedResponse, buildClient } from '@lokalise/backend-http-client'
import { createWriteStream } from 'node:fs'

const exportCsv = defineRouteContract({
  method: 'get',
  requestPathParamsSchema: z.object({ reportId: z.string() }),
  pathResolver: ({ reportId }) => `/reports/${reportId}/export`,
})

const result = await sendByRouteContractWithStreamedResponse(
  client,
  exportCsv,
  { pathParams: { reportId: '42' } },
  { requestLabel: 'export-report' },
)

// Pipe to file
result.result.body.pipe(createWriteStream('/tmp/report.csv'))

// Or consume manually
for await (const chunk of result.result.body) {
  process(chunk)
}
```

> **Important:** The response body **must** be fully consumed or explicitly dumped. Leaving it unconsumed causes connection leaks.
>
> ```ts
> // Dump if you don't need the body
> await result.result.body.dump()
> ```

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

## Either

All send methods return `Either<Error, Result>`:

- `result` is always defined on success
- `error` is defined (and `result` undefined) on failure when `throwOnError: false`

```ts
const { result, error } = await sendByRouteContract(client, contract, params, { throwOnError: false, requestLabel: 'test' })

if (error) {
  // handle error
} else {
  console.log(result.body)
}
```

---

## Deprecated API

> The functions below are **deprecated**. Use `sendByRouteContract` and `sendByRouteContractWithStreamedResponse` instead.

| Deprecated | Replacement |
|---|---|
| `sendByContract` | `sendByRouteContract` |
| `sendByContractWithStreamedResponse` | `sendByRouteContractWithStreamedResponse` |
| `sendByGetRoute` | `sendByRouteContract` |
| `sendByDeleteRoute` | `sendByRouteContract` |
| `sendByPayloadRoute` | `sendByRouteContract` |
| `sendByGetRouteWithStreamedResponse` | `sendByRouteContractWithStreamedResponse` |
