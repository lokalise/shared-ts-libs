# Frontend HTTP client

Opinionated HTTP client for the frontend.

Note that it is a ESM-only package.

## Basic usage

```ts
import wretch from 'wretch'
import { z } from 'zod/v4'

const client = wretch('http://localhost:8000')

const queryParamsSchema = z.object({
	param1: z.string(),
	param2: z.number(),
})

const requestBodySchema = z.object({
	requestCode: z.number(),
})

const responseBodySchema = z.object({
	success: z.boolean(),
})

const responseBody = await sendPost(client, {
	path: '/',
	body: { requestCode: 100 },
	queryParams: { param1: 'test', param2: 123 },
	queryParamsSchema,
	requestBodySchema,
	responseBodySchema,
})
```

### No content response handling (HTTP 204)

SDK methods has a parameter (`isEmptyResponseExpected`) to specify if 204 response should be treated as an error or not. By default it is treated as
valid except on `sendGet` method where it is treated as an error. Usage example:

```ts
const response = await sendGet(client, {
	path: '/',
	isEmptyResponseExpected: true,
})
```

if `204` responses are expected, the library will return null, if not, it will throw an error.

### Non-JSON response handling

SDK methods has a parameter (`isNonJSONResponseExpected`) to specify if non json responses should be treated as an error
or not. By default it is treated as valid except on `sendGet` method where it is treated as an error. Usage example:

```ts
const response = await sendGet(client, {
	path: '/',
	isNonJSONResponseExpected: true,
})
```

if non-JSON responses are expected, the library will return null, if not, it will throw an error.

### API contract-based requests

`frontend-http-client` supports using API contracts, created with `@lokalise/api-contracts` in order to make fully type-safe HTTP requests.

`sendByApiContract` is the modern, fully type-safe way to make HTTP requests from the frontend. It works with contracts defined using `defineApiContract` from `@lokalise/api-contracts` and automatically infers the response type from the contract's `responsesByStatusCode` map.

```ts
import { defineApiContract } from '@lokalise/api-contracts'
import { sendByApiContract } from '@lokalise/frontend-http-client'
import wretch from 'wretch'
import { z } from 'zod/v4'

const getUser = defineApiContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    200: z.object({ id: z.string(), name: z.string() }),
  },
})

const client = wretch('https://api.example.com')

const { result } = await sendByApiContract(client, getUser, { pathParams: { userId: '1' } })
// result.body: { id: string; name: string }
```

> **Note:** The individual `sendByPayloadRoute`, `sendByGetRoute`, `sendByDeleteRoute`, and `sendByContract` methods are deprecated in favor of `sendByApiContract`.

### Supported response kinds

`sendByApiContract` handles all response kinds defined in the contract:

| Contract entry | `body` type |
|---|---|
| `z.ZodType` | Inferred from the schema — parsed and validated |
| `ContractNoBody` | `null` |
| `textResponse(mimeType)` | `string` |
| `blobResponse(mimeType)` | `Blob` |
| `sseResponse(schemaByEventName)` | `AsyncIterable` of typed events |
| `anyOfResponses([sseResponse(…), z.object(…)])` | Requires an explicit `streaming: boolean` param |

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

By default (`captureAsError: true`), the result type only includes success status codes. Non-2xx responses defined in the contract are returned as `Either.error`. Status codes absent from the contract are always returned as `Either.error` with an `UnexpectedResponseError`.

```ts
const response = await sendByApiContract(client, contract, params)

if (response.error) {
  // network error or non-2xx response
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

Status codes absent from the contract always surface as `Either.error`, regardless of this option.

### UnexpectedResponseError

When a response cannot be mapped — because its status code is not listed in `responsesByStatusCode`, or because its `content-type` doesn't match the contract entry — `sendByApiContract` returns an `UnexpectedResponseError` as `Either.error`.

```ts
import { UnexpectedResponseError } from '@lokalise/frontend-http-client'

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
| Network error | Browser / fetch network error |
| Manual cancellation — `signal` fired | `AbortError` (`DOMException`) |
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
  // Network error, abort, or schema/parse failure
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

### Lazy / async headers

`headers` accepts a plain object, a synchronous function, or an async function. This is useful for auth tokens that need to be fetched at call time:

```ts
await sendByApiContract(client, contract, {
  headers: async () => ({ authorization: `Bearer ${await getToken()}` }),
})
```

### Aborting a request

Pass an `AbortSignal` via `signal` to cancel an in-flight request:

```ts
const controller = new AbortController()

const request = sendByApiContract(client, contract, { signal: controller.signal })

controller.abort()
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `captureAsError` | `boolean` | `true` | When `true`, non-2xx responses defined in the contract go to `Either.error`. When `false`, all contract-defined status codes go to `Either.result`. |
| `strictContentType` | `boolean` | `true` | When `true`, returns an error if the response `content-type` doesn't match the contract entry. When `false`, falls back to the entry's kind for single-entry responses. |
| `signal` | `AbortSignal` | — | Manual cancellation signal. When fired, the request rejects with an `AbortError`. |

### Server-sent events (SSE) — connectSseByContract

`connectSseByContract` opens an SSE stream defined by a contract and dispatches typed, schema-validated events to callbacks.

The connection starts immediately and runs in the background until the server closes the stream or you call `close()`. There is no automatic reconnection — if you need that, call `connectSseByContract` again from `onError` or after `onDone`.

```ts
import { buildSseContract } from '@lokalise/api-contracts'
import { connectSseByContract } from '@lokalise/frontend-http-client'
import wretch from 'wretch'
import { z } from 'zod/v4'

const exportContract = buildSseContract({
    method: 'get',
    pathResolver: (params: { projectId: string }) => `/projects/${params.projectId}/export`,
    requestPathParamsSchema: z.object({ projectId: z.string() }),
    serverSentEventSchemas: {
        'item.exported': z.object({ id: z.string(), name: z.string() }),
        done: z.object({ total: z.number() }),
    },
})

const client = wretch('http://localhost:8000')

const connection = connectSseByContract(
    client,
    exportContract,
    { pathParams: { projectId: 'proj_123' } },
    {
        onEvent: {
            'item.exported': (data) => console.log('exported item:', data.id),
            done: (data) => console.log('finished, total:', data.total),
        },
        onOpen: () => console.log('stream opened'),
        onError: (err) => console.error('stream error:', err),
    },
)

// Stop the stream early if needed (e.g. user navigates away)
connection.close()
```

The following parameters can be specified:
- `pathParams` – path parameters used by the contract's path resolver
- `queryParams` – query parameters (type must match the contract definition)
- `body` – request body for POST/PUT/PATCH SSE endpoints
- `headers` – custom headers, or a (optionally async) function returning headers (useful for auth tokens)
- `pathPrefix` – optional prefix prepended to the resolved path

### Tracking request progress
Tracking requests progress is especially useful while uploading files. 

> **Important note**: `wretch` does not support request progress tracking, so we rely on XMLHttpRequest. That's why the interface of the method below is slightly different from the others 

Usage example:

```ts
 const response = await sendPostWithProgress({
    path: '/',
    data: new FormData(), 
    headers: { Authorization: 'Bearer ...' }, 
    responseBodySchema: z.object(),
    onProgress: (progress) => {
        console.log(`Loaded ${progress.loaded} of ${progress.total}`)
    }
})
```

### Aborting pending requests
Aborting requests is especially useful while uploading files. 

> **Important note**: Currently it is only possible with `sendWithProgress()` function 

Usage example:

```ts
const abortController = new AbortController()

sendPostWithProgress({
    path: '/',
    data: new FormData(), 
    headers: { Authorization: 'Bearer ...' },
    responseBodySchema: z.object(),
    onProgress: (progress) => {
        console.log(`Loaded ${progress.loaded} of ${progress.total}`)
    },
    abortController
})

abortController.abort()
```

## Credits

This library is brought to you by a joint effort of Lokalise engineers:

- [Ondrej Sevcik](https://github.com/ondrejsevcik)
- [Szymon Chudy](https://github.com/szymonchudy)
- [Nivedita Bhat](https://github.com/NiveditaBhat)
- [Arthur Suermondt](https://github.com/arthuracs)
- [Lauris Mikāls](https://github.com/laurismikals)
- [Oskar Kupski](https://github.com/oskarski)
- [Igor Savin](https://github.com/kibertoad)
