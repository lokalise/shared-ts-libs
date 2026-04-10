# sendByApiContract

`sendByApiContract` is the modern, fully type-safe way to make HTTP requests from the frontend.
It works with contracts defined using `defineApiContract` from `@lokalise/api-contracts` and automatically infers the response type from the contract's `responsesByStatusCode` map.

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

## Supported response kinds

`sendByApiContract` handles all response kinds defined in the contract:

| Contract entry | `body` type |
|---|---|
| `z.ZodType` | Inferred from the schema — parsed and validated |
| `ContractNoBody` | `null` |
| `textResponse(mimeType)` | `string` |
| `blobResponse(mimeType)` | `Blob` |
| `sseResponse(schemaByEventName)` | `AsyncIterable` of typed events |
| `anyOfResponses([sseResponse(…), z.object(…)])` | Requires an explicit `streaming: boolean` param |

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

By default (`captureAsError: true`), the result type only includes success status codes. HTTP 4xx/5xx responses defined in the contract are returned as `Either.error`. Status codes absent from the contract are always returned as `Either.error` with an `UnexpectedResponseError`.

```ts
const response = await sendByApiContract(client, contract, params)

if (response.error) {
  // network error or non-2xx response
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

## Lazy / async headers

`headers` accepts a plain object, a synchronous function, or an async function. This is useful for auth tokens that need to be fetched at call time:

```ts
await sendByApiContract(client, contract, {
  headers: async () => ({ authorization: `Bearer ${await getToken()}` }),
})
```

## Aborting a request

Pass an `AbortSignal` via `signal` to cancel an in-flight request:

```ts
const controller = new AbortController()

const request = sendByApiContract(client, contract, {}, { signal: controller.signal })

controller.abort()
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `captureAsError` | `boolean` | `true` | When `true`, 4xx/5xx responses defined in the contract go to `Either.error`. When `false`, all contract-defined status codes go to `Either.result`. |
| `strictContentType` | `boolean` | `true` | When `true`, returns an error if the response `content-type` doesn't match the contract entry. When `false`, falls back to the entry's kind for single-entry responses. |
| `signal` | `AbortSignal` | — | Manual cancellation signal. When fired, the request rejects with an `AbortError`. |
