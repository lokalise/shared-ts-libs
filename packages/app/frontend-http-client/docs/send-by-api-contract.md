# `sendByApiContract`

Type-safe HTTP client function that sends a request described by an `@lokalise/api-contracts` contract and returns a typed `Either` result.

## Signature

```ts
function sendByApiContract<
  TApiContract extends ApiContract,
  TIsStreaming extends boolean = DefaultStreaming<TApiContract['responsesByStatusCode']>,
  TCaptureAsError extends boolean = true,
>(
  wretch: WretchInstance,
  routeContract: TApiContract,
  params: RequestParams<...> & StreamingParam<...>,
  options?: ContractRequestOptions<TCaptureAsError>,
): Promise<Either<unknown, ...>>
```

## Parameters

### `wretch`

A `wretch` instance configured with the base URL. Headers and middleware set on the instance are preserved; `sendByApiContract` adds its own per-request headers on top.

```ts
import wretch from 'wretch'

const client = wretch('https://api.example.com')
```

### `routeContract`

A contract created with `defineApiContract` from `@lokalise/api-contracts`. It encodes the HTTP method, path resolver, optional request schemas, and the set of expected response schemas keyed by status code.

### `params`

Runtime values for the request. Which fields are required depends on the contract's schemas.

| Field | Type | Description |
|---|---|---|
| `pathParams` | inferred from `requestPathParamsSchema` | Path parameters passed to the contract's `pathResolver`. Required when the schema is defined. |
| `body` | inferred from `requestBodySchema` | Request body for POST / PUT / PATCH. Required when the schema is defined. |
| `queryParams` | inferred from `requestQuerySchema` | Query string parameters. Required when the schema is defined. |
| `headers` | inferred from `requestHeaderSchema`, or a sync/async function returning them | Request headers. Required when the schema is defined. |
| `pathPrefix` | `string` (optional) | Prepended to the resolved path, e.g. `'api'` → `/api/products/1`. |
| `streaming` | `boolean` | Required (and typed) only for dual-mode contracts (`anyOfResponses`). Selects whether to request an SSE stream (`true`) or a regular JSON response (`false`). |

#### Lazy / async headers

`headers` accepts a plain object, a synchronous function, or an async function. This is useful for auth tokens that need to be fetched at call time:

```ts
await sendByApiContract(client, contract, {
  headers: async () => ({ authorization: `Bearer ${await getToken()}` }),
})
```

### `options`

All fields are optional. Defaults are shown.

| Field | Default | Description |
|---|---|---|
| `validateResponse` | `true` | When `true`, parses the response body through the contract's Zod schema and throws on mismatch. When `false`, returns the raw parsed value. |
| `captureAsError` | `true` | When `true`, non-2xx responses are placed in `Either.error`. When `false`, all HTTP responses whose status code is listed in the contract are placed in `Either.result`. |
| `strictContentType` | `true` | When `true`, returns an error if the response `content-type` doesn't match the contract entry. When `false`, falls back to the contract entry's kind (only applies to single-entry responses, not `anyOfResponses`). |
| `signal` | `undefined` | Optional `AbortSignal` to cancel the request mid-flight. |

## Return value

Returns `Promise<Either<unknown, ResponseObject>>` where `Either` is:

```ts
type Either<E, R> =
  | { error: E; result?: never }
  | { error?: never; result: R }
```

`result` (when defined) has the shape:

```ts
{
  statusCode: number
  headers: <inferred from contract> & Record<string, string | undefined>
  body: <inferred from contract>
}
```

The exact type of `body` depends on the response kind defined in the contract:

| Contract entry | `body` type |
|---|---|
| `z.object(...)` / any Zod schema | Inferred from the schema |
| `ContractNoBody` | `null` |
| `textResponse(mimeType)` | `string` |
| `blobResponse(mimeType)` | `Blob` |
| `sseResponse(schemaByEventName)` | `AsyncIterable<{ event: string; data: ... }>` |

When `captureAsError: true` (default), `result` is narrowed to success status codes only. The `error` field holds the response when the server returned a non-2xx status.

When `captureAsError: false`, `result` includes all status codes listed in the contract and the type union reflects all of them.

## Examples

### GET with path params

```ts
const contract = defineApiContract({
  method: 'get',
  requestPathParamsSchema: z.object({ id: z.string() }),
  pathResolver: ({ id }) => `/products/${id}`,
  responsesByStatusCode: {
    200: z.object({ id: z.string(), name: z.string() }),
  },
})

const { result, error } = await sendByApiContract(client, contract, {
  pathParams: { id: 'abc' },
})

if (result) {
  console.log(result.body.name) // typed as string
}
```

### GET with query params

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/products',
  requestQuerySchema: z.object({ limit: z.number(), offset: z.number() }),
  responsesByStatusCode: { 200: z.array(z.object({ id: z.string() })) },
})

const { result } = await sendByApiContract(client, contract, {
  queryParams: { limit: 20, offset: 0 },
})
```

### POST with body

```ts
const contract = defineApiContract({
  method: 'post',
  pathResolver: () => '/products',
  requestBodySchema: z.object({ name: z.string() }),
  responsesByStatusCode: { 201: z.object({ id: z.string() }) },
})

const { result } = await sendByApiContract(client, contract, {
  body: { name: 'Backpack' },
})
```

### DELETE (no-content response)

```ts
const contract = defineApiContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ id: z.string() }),
  pathResolver: ({ id }) => `/products/${id}`,
  responsesByStatusCode: { 204: ContractNoBody },
})

const { result } = await sendByApiContract(client, contract, {
  pathParams: { id: 'abc' },
})
// result.body === null
```

### Handling non-2xx responses via `captureAsError: false`

When a contract declares error status codes, set `captureAsError: false` to receive them in `result` rather than `error`. The return type narrows accordingly.

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/products/1',
  responsesByStatusCode: {
    200: z.object({ id: z.number() }),
    404: z.object({ message: z.string() }),
  },
})

const { result } = await sendByApiContract(client, contract, {}, { captureAsError: false })

if (result?.statusCode === 404) {
  console.log(result.body.message) // typed as string
}
```

### SSE streaming

For contracts with `sseResponse`, the function defaults to streaming mode. `result.body` is an `AsyncIterable` that yields typed, schema-validated events.

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/events',
  responsesByStatusCode: {
    200: sseResponse({ update: z.object({ id: z.string() }) }),
  },
})

const { result } = await sendByApiContract(client, contract, {})

if (result) {
  for await (const event of result.body) {
    // event: { event: 'update'; data: { id: string } }
    console.log(event.data.id)
  }
}
```

### Dual-mode (SSE or JSON)

When a contract uses `anyOfResponses` mixing SSE and JSON, pass `streaming` explicitly to select the mode. The return type changes based on what you pass.

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: () => '/feed',
  responsesByStatusCode: {
    200: anyOfResponses([
      sseResponse({ update: z.object({ id: z.string() }) }),
      z.object({ latest: z.string() }),
    ]),
  },
})

// Streaming mode — body is AsyncIterable
const { result: stream } = await sendByApiContract(client, contract, { streaming: true })

// JSON mode — body is { latest: string }
const { result: json } = await sendByApiContract(client, contract, { streaming: false })
```

### Path prefix

Useful when the wretch base URL does not include a version prefix that only applies to some routes.

```ts
const { result } = await sendByApiContract(client, contract, { pathPrefix: 'api/v2' })
// resolves to /api/v2/products/1
```

### Aborting a request

```ts
const controller = new AbortController()

const request = sendByApiContract(client, contract, {}, { signal: controller.signal })

// Cancel before the response arrives
controller.abort()
```

### Skipping response validation

```ts
const { result } = await sendByApiContract(client, contract, {}, { validateResponse: false })
// result.body is the raw parsed JSON value, no Zod parsing applied
```
