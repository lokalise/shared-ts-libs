# sendByApiContract

`sendByApiContract` is the modern, fully type-safe way to make HTTP requests from the backend.
It works with contracts defined using `defineApiContract` from `@lokalise/api-contracts` and automatically infers the response type from the contract's `responsesByStatusCode` map.

```ts
import { defineApiContract } from '@lokalise/api-contracts'
import { buildClient, sendByApiContract } from '@lokalise/backend-http-client'
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

const { result } = await sendByApiContract(client, getUser, { pathParams: { userId: '1' } })
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

> **Header normalisation caveat:** multi-value headers are joined into a single comma-separated string. This is correct for most headers but mangles `set-cookie` — cookies that arrive as separate headers are collapsed into one string. If you need individual `Set-Cookie` values, this is a known limitation. A future `rawHeaders` field may expose the original undici headers as an escape hatch.

By default (`captureAsError: true`), the result type only includes success status codes. Non-2xx responses defined in the contract are returned as `Either.error`. Status codes absent from the contract are always returned as `Either.error`.

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

Non-2xx status codes defined in `responsesByStatusCode` are returned as `Either.error` with the parsed body. The `result` type is narrowed to success status codes only.

```ts
const contract = defineApiContract({
  method: 'get',
  requestPathParamsSchema: z.object({ id: z.string() }),
  pathResolver: ({ id }) => `/users/${id}`,
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
const response = await sendByApiContract(client, contract, {
  pathParams: { id: '1' },
  captureAsError: false,
})

// response.result is typed for both 200 and 404
if (response.result.statusCode === 404) {
  response.result.body // { message: string }
}
```

Status codes absent from the contract always surface as `Either.error` as an [`UnexpectedResponseError`](#unexpectedresponseerror), regardless of this option.

## UnexpectedResponseError

When a response cannot be mapped — because its status code is not listed in `responsesByStatusCode`, or because its `content-type` doesn't match the contract entry — `sendByApiContract` returns an `UnexpectedResponseError` as `Either.error`.

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
import { anyOfResponses, sseResponse } from '@lokalise/api-contracts'

// SSE-only — AsyncIterable is returned automatically
const notifications = defineApiContract({
  method: 'get',
  pathResolver: () => '/notifications',
  responsesByStatusCode: {
    200: sseResponse({ update: z.object({ id: z.string() }) }),
  },
})

const { result } = await sendByApiContract(client, notifications, {})
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

const stream = await sendByApiContract(client, chat, { body: { message: 'hi' }, streaming: true })
// stream.result.body: AsyncIterable<{ type: 'chunk'; data: { delta: string }; lastEventId: string; retry: number | undefined }>

const json = await sendByApiContract(client, chat, { body: { message: 'hi' }, streaming: false })
// json.result.body: { text: string }
```

The `streaming` param is **required** for dual-mode contracts and is **not allowed** for any other contract kind.

## Timeout

Use `timeout` to set a per-attempt deadline in milliseconds. Each attempt (including retries) gets its own independent timer. When it fires, the request throws a `TimeoutError` (a `DOMException` — distinct from the `AbortError` thrown by a manual abort).

```ts
const { result } = await sendByApiContract(client, getUser, {
  pathParams: { userId: '1' },
  timeout: 5000,
})
```

For a total deadline across all attempts, pass an `AbortSignal` via `signal` instead:

```ts
const { result } = await sendByApiContract(client, getUser, {
  pathParams: { userId: '1' },
  signal: AbortSignal.timeout(10_000),
})
```

To combine both, use `AbortSignal.any`:

```ts
const controller = new AbortController()

const { result } = await sendByApiContract(client, getUser, {
  pathParams: { userId: '1' },
  timeout: 5_000,
  signal: AbortSignal.any([AbortSignal.timeout(15_000), controller.signal]),
})
```

When the total signal fires, the request rejects with an `AbortError` and any pending retry is stopped immediately.

## Retry

Pass a `retry` option to retry failed requests. Pass `true` to use all defaults, or a config object to customise behaviour:

```ts
// shorthand — retry up to 2 times with all defaults
const { result } = await sendByApiContract(client, getUser, {
  pathParams: { userId: '1' },
  retry: true,
})

// full config
const { result } = await sendByApiContract(client, getUser, {
  pathParams: { userId: '1' },
  retry: {
    maxRetries: 3,
    statusCodes: [503, 429],
  },
})
```

`maxRetries` is the number of retries after the initial attempt — `maxRetries: 2` allows up to 3 total calls.

When retries are exhausted:
- **Status code retries** — the final response is processed normally; it surfaces as `Either.result` or `Either.error` depending on `captureAsError`.
- **Network error retries** — the last error is re-thrown (not wrapped in `Either`).

### Delay and backoff

The `delay` function controls how long to wait before each retry. It receives the retry number (1 = first retry, 2 = second, …) and returns milliseconds. Default: exponential backoff — `100 * 2^(n - 1)` (100 ms, 200 ms, 400 ms, …).

```ts
// constant 200 ms
retry: { delay: () => 200 }

// custom exponential
retry: { delay: (n) => 300 * 2 ** (n - 1) }
```

`maxDelay` caps the final delay for any retry, including `Retry-After` values. Default: `30_000`.

`maxJitter` adds up to this many milliseconds of random jitter on top of any delay, including `Retry-After` values, to spread out concurrent retries. Default: `100`.

### Retry-After

When a `Retry-After` response header is present and `respectRetryAfter` is `true` (default), it takes precedence over `delay()`. Falls back to `delay()` when the header is absent or unparseable. `maxDelay` and `maxJitter` still apply. Set `respectRetryAfter: false` to always use `delay()`.

### Network errors and timeouts

```ts
retry: {
  maxRetries: 3,
  retryOnNetworkError: true,  // default: true — retry on UND_ERR_SOCKET etc.
  retryOnTimeout: true,       // default: true — retry when per-attempt timeout fires
}
```

`retryOnTimeout` only has effect when `timeout` is set. With `retryOnTimeout: true` and `timeout: 5000`, each attempt gets a fresh 5 s timer and a timed-out attempt is retried just like a network error.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `captureAsError` | `boolean` | `true` | When `true`, non-2xx responses defined in the contract go to `Either.error`. When `false`, all contract-defined status codes go to `Either.result`. |
| `timeout` | `number` | — | Per-attempt timeout in milliseconds. Each attempt gets its own independent timer. For a total deadline, use `signal` instead. |
| `signal` | `AbortSignal` | — | Total deadline or manual cancellation. Stops retries immediately when fired. Combine with `timeout` for both per-attempt and total deadlines. |
| `retry` | `RetryConfig \| true` | — | Retry configuration. Pass `true` for all defaults, or a config object. See [Retry](#retry). |
| `reqContext` | `{ reqId: string }` | — | Forwarded as `x-request-id` header for distributed tracing. |
| `strictContentType` | `boolean` | `true` | When `true`, returns an error if the response `content-type` doesn't match the contract entry. When `false`, falls back to the entry's kind for single-entry responses. |
| `disableKeepAlive` | `boolean` | `false` | Closes the connection after the request instead of returning it to the pool. Useful for one-off requests. |

### RetryConfig

| Field | Type | Default | Description |
|---|---|---|---|
| `maxRetries` | `number` | `2` | Maximum number of retries after the initial attempt. |
| `statusCodes` | `number[]` | `[408, 425, 429, 500, 502, 503, 504]` | HTTP status codes that trigger a retry. |
| `delay` | `(n: number) => number` | `(n) => 100 * 2^(n-1)` | Delay in ms before retry `n`. |
| `maxDelay` | `number` | `30_000` | Hard cap on any delay, including `Retry-After`. |
| `maxJitter` | `number` | `100` | Maximum additive random jitter in ms added to every delay. |
| `respectRetryAfter` | `boolean` | `true` | Use the `Retry-After` response header as the delay when present and valid; falls back to `delay()` otherwise. |
| `retryOnNetworkError` | `boolean` | `true` | Retry on network-level errors (e.g. `UND_ERR_SOCKET`). |
| `retryOnTimeout` | `boolean` | `true` | Retry when the per-attempt `timeout` is exceeded. |
