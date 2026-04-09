# sendByApiContract

`sendByApiContract` is the modern, fully type-safe way to make HTTP requests from the backend.
It works with contracts defined using `defineApiContract` from `@lokalise/api-contracts` and automatically infers the response type from the contract's `responsesByStatusCode` map.

```ts
import { defineApiContract } from '@lokalise/api-contracts'
import { sendByApiContract, buildClient } from '@lokalise/backend-http-client'
import { z } from 'zod/v4'

const getUser = defineApiContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    200: z.object({ id: z.string(), name: z.string() }),
  },
})

const client = buildClient('https://api.example.com')

const { result } = await sendByApiContract(
  client,
  getUser,
  { pathParams: { userId: '1' } },
)
// result.body: { id: string; name: string }
```

## Supported response kinds

`sendByApiContract` handles all response kinds defined in the contract:

- **JSON** — `z.ZodType` entries are parsed and validated
- **No body** — `ContractNoBody` on a 2xx status code returns `null`
- **Text** — `textResponse('text/csv')` returns a `string`
- **Blob** — `blobResponse('image/png')` returns a `Blob`
- **SSE** — `sseResponse({ … })` returns an `AsyncIterable` of typed events
- **Dual-mode** — `anyOfResponses([sseResponse(…), z.object(…)])` requires an explicit `streaming: boolean` param

## Return type — Either

`sendByApiContract` always returns an `Either`:

```ts
type Either<TError, TResult> =
  | { error: TError; result?: never }
  | { error?: never; result: TResult }
```

`result` (when defined) has the shape:

```ts
{
  statusCode: number
  headers: <inferred from contract> & Record<string, string | undefined>
  body: <inferred from contract>
}
```

By default (`captureAsError: true`), the result type only includes success status codes. HTTP 4xx/5xx responses defined in the contract are returned as `Either.error`. Status codes absent from the contract are always returned as `Either.error`.

```ts
const response = await sendByApiContract(client, contract, params)

if (response.error) {
  // network error, retry exhaustion, or non-2xx response
} else {
  response.result.body // typed to the 2xx response schema
}
```

## Non-2xx responses

### captureAsError: true (default)

4xx/5xx status codes defined in `responsesByStatusCode` are returned as `Either.error` with the parsed body. The `result` type is narrowed to success status codes only.

```ts
const contract = defineApiContract({
  method: 'get',
  pathResolver: ({ id }) => `/users/${id}`,
  requestPathParamsSchema: z.object({ id: z.string() }),
  responsesByStatusCode: {
    200: z.object({ id: z.string(), name: z.string() }),
    404: z.object({ message: z.string() }),
  },
})

const response = await sendByApiContract(client, contract, { pathParams: { id: '1' } })

// response.result is only typed for 200 (success codes)
// response.error holds the 404 body when the server returns 404
```

### captureAsError: false

All status codes defined in `responsesByStatusCode` are returned as `Either.result`, regardless of whether they indicate success or failure.

```ts
const response = await sendByApiContract(
  client,
  contract,
  { pathParams: { id: '1' } },
  { captureAsError: false },
)

// response.result is typed for both 200 and 404
if (response.result.statusCode === 404) {
  response.result.body // { message: string }
}
```

Status codes absent from the contract always surface as `Either.error`, regardless of this option.

## UnexpectedResponseError

When a response cannot be mapped — either because its status code is not listed in `responsesByStatusCode`, or because its `content-type` doesn't match the contract entry — `sendByApiContract` returns an `UnexpectedResponseError` as `Either.error`.

```ts
import { UnexpectedResponseError } from '@lokalise/backend-http-client'

const response = await sendByApiContract(client, contract, params)

if (response.error instanceof UnexpectedResponseError) {
  console.log(response.error.statusCode) // e.g. 503
  console.log(response.error.headers['content-type'])
  console.log(response.error.body) // raw response body as text
}
```

`UnexpectedResponseError` supports cross-realm `instanceof` checks via `Symbol.hasInstance`, so it works correctly even when the error crosses module or VM boundaries.

| Property | Type | Description |
|---|---|---|
| `statusCode` | `number` | HTTP status code of the unexpected response. |
| `headers` | `Record<string, string \| undefined>` | Normalised response headers. |
| `body` | `string` | Raw response body read as UTF-8 text. |

## SSE and dual-mode

```ts
import { sseResponse, anyOfResponses } from '@lokalise/api-contracts'

// SSE-only — AsyncIterable is returned automatically
const notifications = defineApiContract({
  method: 'get',
  pathResolver: () => '/notifications',
  responsesByStatusCode: {
    200: sseResponse({ update: z.object({ id: z.string() }) }),
  },
})

const { result } = await sendByApiContract(client, notifications)
for await (const event of result.body) {
  // event: { type: 'update'; data: { id: string }; lastEventId: string; retry: number | undefined }
}

// Dual-mode — streaming: true/false selects between SSE and JSON
const chat = defineApiContract({
  method: 'post',
  pathResolver: () => '/chat',
  requestBodySchema: z.object({ message: z.string() }),
  responsesByStatusCode: {
    200: anyOfResponses([
      sseResponse({ chunk: z.object({ delta: z.string() }) }),
      z.object({ text: z.string() }),
    ]),
  },
})

const stream = await sendByApiContract(
  client,
  chat,
  { body: { message: 'hi' }, streaming: true },
)
// stream.result.body: AsyncIterable<{ type: 'chunk'; data: { delta: string }; lastEventId: string; retry: number | undefined }>

const json = await sendByApiContract(
  client,
  chat,
  { body: { message: 'hi' }, streaming: false },
)
// json.result.body: { text: string }
```

## Timeout

There is no `timeout` option. Use `AbortSignal.timeout(ms)` via the `signal` option instead:

```ts
const { result } = await sendByApiContract(
  client,
  getUser,
  { pathParams: { userId: '1' } },
  { signal: AbortSignal.timeout(5000) },
)
```

To combine a timeout with manual cancellation, use `AbortSignal.any`:

```ts
const controller = new AbortController()

const { result } = await sendByApiContract(
  client,
  getUser,
  { pathParams: { userId: '1' } },
  { signal: AbortSignal.any([AbortSignal.timeout(5000), controller.signal]) },
)
```

When the signal fires, the request rejects with an `AbortError`.

## Retry

Pass a `retryConfig` to retry failed requests. Uses `RetryConfig` from `undici-retry`:

```ts
import { createDefaultRetryResolver } from '@lokalise/backend-http-client'

const { result } = await sendByApiContract(
  client,
  getUser,
  { pathParams: { userId: '1' } },
  {
    retryConfig: {
      maxAttempts: 3,
      statusCodesToRetry: [503, 429],
      retryOnTimeout: true,
      delayResolver: createDefaultRetryResolver(),
    },
  },
)
```

`maxAttempts` is the total number of attempts (initial + retries). When all attempts are exhausted, the last error response is returned as `Either.error`.

### Network-level errors

Network-level errors such as `UND_ERR_SOCKET` (connection closed) have no HTTP status code. The retry handler proxies them to status `500` when consulting the `delayResolver`, so include `500` in `statusCodesToRetry` to retry on connection failures:

```ts
retryConfig: {
  maxAttempts: 3,
  statusCodesToRetry: [500, 503, 429],
  delayResolver: createDefaultRetryResolver(),
}
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `captureAsError` | `boolean` | `true` | When `true`, 4xx/5xx responses defined in the contract go to `Either.error`. When `false`, all contract-defined status codes go to `Either.result`. |
| `signal` | `AbortSignal` | — | Cancel the request or apply a timeout. Use `AbortSignal.timeout(ms)` for timeouts or `AbortSignal.any([…])` to combine sources. Rejects with `AbortError` when fired. |
| `reqContext` | `{ reqId: string }` | — | Forwarded as `x-request-id` header for distributed tracing. |
| `strictContentType` | `boolean` | `true` | When `true`, returns an error if the response `content-type` doesn't match the contract entry. When `false`, falls back to the entry's kind for single-entry responses. |
| `disableKeepAlive` | `boolean` | `false` | Disable connection keep-alive for this request. |
| `retryConfig` | `RetryConfig` | — | Retry configuration. See [Retry](#retry). |
