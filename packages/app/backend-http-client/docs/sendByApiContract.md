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
  { requestLabel: 'get-user' },
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

## Timeout

There is no `timeout` option. Use `AbortSignal.timeout(ms)` via the `signal` option instead:

```ts
const { result } = await sendByApiContract(
  client,
  getUser,
  { pathParams: { userId: '1' } },
  { requestLabel: 'get-user', signal: AbortSignal.timeout(5000) },
)
```

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

const { result } = await sendByApiContract(client, notifications, {}, { requestLabel: 'subscribe' })
for await (const event of result.body) {
  // event: { event: 'update'; data: { id: string } }
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
  { requestLabel: 'chat' },
)
// stream.result.body: AsyncIterable<{ event: 'chunk'; data: { delta: string } }>

const json = await sendByApiContract(
  client,
  chat,
  { body: { message: 'hi' }, streaming: false },
  { requestLabel: 'chat' },
)
// json.result.body: { text: string }
```

## Options

| Option | Type | Description |
|---|---|---|
| `requestLabel` | `string` | Required. Included in errors for context. |
| `signal` | `AbortSignal` | Cancel the request or set a timeout via `AbortSignal.timeout(ms)`. |
| `reqContext` | `{ reqId: string }` | Forwarded as `x-request-id` header. |
| `throwOnError` | `boolean` | Throw on error responses instead of returning `Either`. Default: `true`. |
| `validateResponse` | `boolean` | Validate the response body against the contract schema. Default: `true`. |
| `disableKeepAlive` | `boolean` | Disable connection keep-alive for this request. |
| `retryConfig` | `RetryConfig` | Retry configuration. Default: no retries. |
