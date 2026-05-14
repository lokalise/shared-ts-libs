# backend-http-client 🧬

Opinionated HTTP client for the Node.js backend

## Overview

The library provides methods to implement the client side of HTTP protocols. Public methods available are:

- `buildClient()`, which returns a [Client](https://undici.nodejs.org/#/docs/api/Client) instance and should be called before any of the following methods with parameters:
  - `baseUrl`;
  - `clientOptions` – set of [ClientOptions](https://undici.nodejs.org/#/docs/api/Client?id=parameter-clientoptions) (optional). If none are provided, the following default options will be used to instantiate the client:
    ```
    keepAliveMaxTimeout: 300_000,
    keepAliveTimeout: 4000,
    ```
- `sendByApiContract()`, the recommended method for making type-safe HTTP requests from an `ApiContract` definition (created with `defineApiContract`);
- `sendByContract()` _(deprecated — use `sendByApiContract` instead)_;
- `sendByContractWithStreamedResponse()` _(deprecated — use `sendByApiContract` instead)_;
- `sendGet()`;
- `sendGetWithStreamedResponse()`;
- `sendPost()`;
- `sendPostWithStreamedResponse()`;
- `sendPut()`;
- `sendPutBinary()`;
- `sendDelete()`;
- `sendPatch()`.

All _send_ methods accept a type parameter and the following arguments:

- `client`, the return value of `buildClient()`;
- `path`;
- `options` – (optional). Possible values are:

  - `headers`;
  - `query`, query string params to be embedded in the request URL;
  - `timeout`, the timeout after which a request will time out, in milliseconds. Default is 30 seconds. Pass `undefined` if you prefer to have no timeout;
  - `throwOnError`;`
  - `reqContext`;
  - `safeParseJson`, used when the response content-type is `application/json`. If `true`, the response body will be parsed as JSON and a `ResponseError` will be thrown in case of syntax errors. If `false`, errors are not handled;
  - `blobResponseBody`, used when the response body should be returned as Blob;
  - `requestLabel`, this string will be returned together with any thrown or returned Error to provide additional context about what request was being executed when the error has happened;
  - `disableKeepAlive`;`
  - `retryConfig` – pass `true` to enable retries with all defaults, or an object with:
    - `maxRetries?` – maximum number of retries after the initial attempt (default: `2`);
    - `statusCodes?` – HTTP status codes that trigger a retry (default: `[408, 425, 429, 500, 502, 503, 504]`);
    - `delay?` – function `(retryNumber: number) => number` returning the base delay in ms (default: exponential backoff starting at 100 ms);
    - `maxDelay?` – hard cap on any delay in ms (default: `30_000`);
    - `maxJitter?` – maximum random jitter in ms added to each delay (default: `100`);
    - `respectRetryAfter?` – use the `Retry-After` response header as the delay when present (default: `true`);
    - `retryOnNetworkError?` – retry on network-level errors such as socket resets (default: `true`);
    - `retryOnTimeout?` – retry when a per-attempt timeout fires (default: `true`);
  - `clientOptions`;
  - `responseSchema`, used both for inferring the response type of the call, and also (if `validateResponse` is `true`) for validating the response structure;
  - `validateResponse`;
  - `isEmptyResponseExpected`, used to specify if a 204 response should be treated as an error or not. when `true` the response body type is adjusted to include potential `null`

  The following options are applied by default:

  ```
  validateResponse: true,
  throwOnError: true,
  timeout: 30000,
  ```
  No `retryConfig` is set by default — retries are disabled unless explicitly configured.
  For `sendDelete()` `isEmptyResponseExpected` by default is set to `true`, for all other methods it is `false`.

Additionally, `sendPost()`, `sendPut()`, `sendPutBinary()`, and `sendPatch()` also accept a `body` parameter.

The response of any _send_ method will be resolved to always have `result` set, but only have `error` set in case something went wrong. See [Either](#either) for more information.

## Either

The library provides the type `Either` for error handling in the functional paradigm. The two possible values are:

- `result` is defined, `error` is undefined;
- `error` is defined, `result` is undefined.

It's up to the caller of the function to handle the received error or throw an error.

Read [this article](https://antman-does-software.com/stop-catching-errors-in-typescript-use-the-either-type-to-make-your-code-predictable) for more information on how `Either` works and its benefits.

Additionally, `DefiniteEither` is also provided. It is a variation of the aforementioned `Either`, which may or may not have `error` set, but always has `result`.

### API contract-based requests

`backend-http-client` supports using API contracts, created with `@lokalise/api-contracts` in order to make fully type-safe HTTP requests.

`sendByApiContract` is the modern, fully type-safe way to make HTTP requests from the backend. It works with contracts defined using `defineApiContract` from `@lokalise/api-contracts` and automatically infers the response type from the contract's `responsesByStatusCode` map.

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

> **Note:** The individual `sendByPayloadRoute`, `sendByGetRoute`, `sendByDeleteRoute`, `sendByContract`, and `sendByContractWithStreamedResponse` methods are deprecated in favor of `sendByApiContract`.

### Supported response kinds

`sendByApiContract` handles all response kinds defined in the contract:

- **JSON** — `z.ZodType` entries are parsed and validated
- **No body** — `ContractNoBody` on a 2xx status code returns `null`
- **Text** — `textResponse('text/csv')` returns a `string`
- **Blob** — `blobResponse('image/png')` returns a `Blob`
- **SSE** — `sseResponse({ … })` returns an `AsyncIterable` of typed events
- **Dual-mode** — `anyOfResponses([sseResponse(…), z.object(…)])` requires an explicit `streaming: boolean` param

### Return type — Either

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

### Non-2xx responses

#### captureAsError: true (default)

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

#### captureAsError: false

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

### UnexpectedResponseError

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

### Throws

`sendByApiContract` wraps most failure modes in `Either.error`, but the following conditions throw directly. Wrap call sites in `try/catch` if any of these can arise:

| Cause | What is thrown |
|---|---|
| Network error — no retry configured, or all retries exhausted | Undici `UND_ERR_*` error |
| Manual cancellation — `signal` fired | `AbortError` (`DOMException`) |
| Per-attempt timeout expired — `timeout` option, with `retryOnTimeout: false` or retries exhausted | `TimeoutError` (`DOMException`) |
| Response body contains malformed JSON | `SyntaxError` |
| Response body fails JSON schema validation | `ZodError` |
| Response headers fail schema validation — `responseHeaderSchema` defined in the contract | `ZodError` |
| SSE event type has no matching schema in the contract | `Error` |
| SSE event data contains malformed JSON | `SyntaxError` |
| SSE event data fails schema validation | `ZodError` |

```ts
try {
  const response = await sendByApiContract(client, contract, params)

  if (response.error) {
    // Either.error — non-2xx or UnexpectedResponseError
  } else {
    // Either.result — success
  }
} catch (err) {
  // Network error, abort, timeout, or schema/parse failure
}
```

### SSE and dual-mode

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

### Timeout

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

### Retry

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

#### Delay and backoff

The `delay` function controls how long to wait before each retry. It receives the retry number (1 = first retry, 2 = second, …) and returns milliseconds. Default: exponential backoff — `100 * 2^(n - 1)` (100 ms, 200 ms, 400 ms, …).

```ts
// constant 200 ms
retry: { delay: () => 200 }

// custom exponential
retry: { delay: (n) => 300 * 2 ** (n - 1) }
```

`maxDelay` caps the final delay for any retry, including `Retry-After` values. Default: `30_000`.

`maxJitter` adds up to this many milliseconds of random jitter on top of any delay, including `Retry-After` values, to spread out concurrent retries. Default: `100`.

#### Retry-After

When a `Retry-After` response header is present and `respectRetryAfter` is `true` (default), it takes precedence over `delay()`. Falls back to `delay()` when the header is absent or unparseable. `maxDelay` and `maxJitter` still apply. Set `respectRetryAfter: false` to always use `delay()`.

#### Network errors and timeouts

```ts
retry: {
  maxRetries: 3,
  retryOnNetworkError: true,  // default: true — retry on UND_ERR_SOCKET etc.
  retryOnTimeout: true,       // default: true — retry when per-attempt timeout fires
}
```

`retryOnTimeout` only has effect when `timeout` is set. With `retryOnTimeout: true` and `timeout: 5000`, each attempt gets a fresh 5 s timer and a timed-out attempt is retried just like a network error.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `captureAsError` | `boolean` | `true` | When `true`, non-2xx responses defined in the contract go to `Either.error`. When `false`, all contract-defined status codes go to `Either.result`. |
| `timeout` | `number` | — | Per-attempt timeout in milliseconds. Each attempt gets its own independent timer. For a total deadline, use `signal` instead. |
| `signal` | `AbortSignal` | — | Total deadline or manual cancellation. Stops retries immediately when fired. Combine with `timeout` for both per-attempt and total deadlines. |
| `retry` | `RetryConfig \| true` | — | Retry configuration. Pass `true` for all defaults, or a config object. See [Retry](#retry). |
| `reqContext` | `{ reqId: string }` | — | Forwarded as `x-request-id` header for distributed tracing. |
| `strictContentType` | `boolean` | `true` | When `true`, returns an error if the response `content-type` doesn't match the contract entry. When `false`, falls back to the entry's kind for single-entry responses. |
| `disableKeepAlive` | `boolean` | `false` | Closes the connection after the request instead of returning it to the pool. Useful for one-off requests. |

#### RetryConfig

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

### Raw streaming responses

For scenarios where you need to process large response bodies without loading them entirely into memory (e.g., downloading large files, processing data incrementally), use:

- `sendGetWithStreamedResponse()` — for direct path-based GET requests
- `sendPostWithStreamedResponse()` — for direct path-based POST requests with a JSON body

These methods return a `Readable` stream instead of parsing the entire response body.

**Important: The response body MUST be fully consumed or explicitly dumped.** According to the undici documentation, garbage collection in Node.js is less aggressive and deterministic compared to browsers, which means leaving the release of connection resources to the garbage collector can lead to excessive connection usage, reduced performance (due to less connection re-use), and even stalls or deadlocks when running out of connections.

```ts
// ✓ GOOD - Consume the entire stream
for await (const chunk of result.result.body) {
  processChunk(chunk)
}

// ✓ GOOD - Pipe to another stream (consumes it)
result.result.body.pipe(writeStream)

// ✓ GOOD - Dump the body if not needed
await result.result.body.dump()

// ✗ BAD - Never do this (causes connection leaks)
const { headers } = result.result
// body is never consumed - CONNECTION LEAK!
```

Usage example:

```ts
const streamResult = await sendGetWithStreamedResponse(
  client,
  '/api/files/12345',
  { requestLabel: 'Download file' },
)

if (streamResult.result) {
  for await (const chunk of streamResult.result.body) {
    // Handle chunk
  }
}
```
