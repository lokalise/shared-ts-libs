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

### Server-sent events (SSE) — connectSseByContract (deprecated)

> **Deprecated:** Use `sendByApiContract` with an SSE contract (`sseResponse`) instead. See the [SSE and dual-mode](#sse-and-dual-mode) section above.

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

## Resilient live data — SSE with a polling fallback

Push channels fail silently. A connection dies without an error event, a proxy kills an idle
stream, a room rebalance drops a message — and the UI waiting for "upload finished" is stuck
until the user reloads. [`@opinionated-machine/sse-fallback`](https://github.com/kibertoad/opinionated-machine/tree/main/packages/sse-fallback)
solves that by making **polling the correctness backbone and SSE the latency optimization**:
it subscribes to the SSE branch of a dual-mode contract, keeps a deadman timer, and polls the
JSON branch of the same route whenever the stream goes quiet. A single version gate reconciles
the two channels, so application code sees one uniform event stream.

That core owns no HTTP. This package supplies the HTTP half: `createFallbackTransport` gives it
a `fetchSnapshot` / `openStream` pair built on your configured `wretch` client and your API
contracts, with the same schema validation, header handling and path prefixing as
`sendByApiContract`.

```
                    ┌─────────────────────────────────────────────┐
   your code  ◄──── │  createResilientSubscription (sse-fallback) │
   one event        │  version gate · deadman poll · reconnect ·  │
   stream           │  hydration · degradation · budgets          │
                    └──────────────────────┬──────────────────────┘
                                           │ FallbackTransport
                    ┌──────────────────────┴──────────────────────┐
                    │  createFallbackTransport (this package)     │
                    │  Accept negotiation · Last-Event-ID ·       │
                    │  Zod validation · fresh auth headers        │
                    └─────────────────────────────────────────────┘
```

### No dependency, on purpose

This package does **not** depend on `@opinionated-machine/sse-fallback`. The transport seam is
matched structurally, so you install whichever core version you like and nothing here has to
move in lock-step — and consumers who only use the plain HTTP client install nothing extra. A
type test in this repo keeps the vendored declarations honest, so drift fails our build rather
than yours.

```sh
npm install @opinionated-machine/sse-fallback   # the client core, when you need it
```

### Quick start

The contract is **dual-mode**: one status carrying both a JSON representation (the poll) and an
`sseResponse` (the push).

```ts
import { defineApiContract, sseResponse } from '@lokalise/api-contracts'
import { createResilientSubscription, defineFallbackBinding } from '@opinionated-machine/sse-fallback'
import { buildFallbackParams, createFallbackTransport } from '@lokalise/frontend-http-client'
import { z } from 'zod/v4'

const uploadStatusContract = defineApiContract({
  visibility: 'public',
  summary: 'Upload status',
  method: 'get',
  pathResolver: (params: { uploadId: string }) => `/uploads/${params.uploadId}/status`,
  requestPathParamsSchema: z.object({ uploadId: z.string() }),
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': z.object({
          version: z.number(),
          status: z.enum(['pending', 'completed', 'failed']),
        }),
        ...sseResponse({
          uploadFinished: z.object({ version: z.number() }),
          uploadFailed: z.object({ version: z.number(), error: z.string() }),
        }).content,
      },
    },
  },
})

// How a poll snapshot relates to the pushed events — the one thing that cannot be inferred.
const uploadStatusBinding = defineFallbackBinding(uploadStatusContract, {
  snapshotToEvents: (snapshot) =>
    snapshot.status === 'completed'
      ? [{ event: 'uploadFinished', data: { version: snapshot.version } }]
      : [],
  version: { ofSnapshot: (snapshot) => snapshot.version },
  terminalEvents: ['uploadFinished', 'uploadFailed'],
})

const transport = createFallbackTransport(client, {
  contract: uploadStatusContract,
  // Resolved fresh for every poll and every reconnect.
  headers: async () => ({ authorization: `Bearer ${await auth.token()}` }),
  diagnostics: { onEventSchemaError: (error) => reportToBugsnag(error) },
})

const subscription = createResilientSubscription(uploadStatusBinding, {
  transport,
  params: buildFallbackParams(uploadStatusContract, { pathParams: { uploadId } }),
  policy: { subscriptionBudget: { maxDurationMs: 10 * 60_000 } },
  onAuthChallenge: async () => {
    await auth.refresh()
    return true
  },
})

// Resolves identically whether the event arrived over SSE, a replay, or a poll.
await subscription.waitFor('uploadFinished')
```

### What the transport guarantees

| Behaviour | Why it matters to the core |
|---|---|
| `Accept: application/json` on the poll, `text/event-stream` on the stream — always, overriding any request-level `accept` | Branch selection is the transport's job; a params-level `Accept` would send the poll to the stream branch and leave the fallback with no snapshot |
| `Cache-Control: no-cache` on both channels | A cached poll keeps "succeeding" while reporting stale state — the exact silent failure this machinery exists to catch |
| `Last-Event-ID` forwarded on reconnect (omitted when the cursor is empty) | Server-side replay composes with the version gate; an empty cursor would ask for a full replay |
| A non-2xx response **resolves** with its status | The core owns what a status means: `unretryableStatuses`, and handing a 401 to `onAuthChallenge` |
| Only an unusable outcome rejects — network failure, schema violation, wrong representation | A rejected poll is a recoverable poll failure; a snapshot the version gate cannot trust is not |
| Raw text chunks by default, comment frames included | Keeps the core's `staleConnectionTimeoutMs` watchdog byte-level, so a silently dead connection is caught |
| No cross-subscription state | One transport serves any number of subscriptions; nothing a stream learns is carried into another, so a per-tenant cursor can never reach the wrong stream |
| A snapshot it refuses has its body released | The core aborts a poll on timeout or on stopping, never one the transport rejected — an unread body (an SSE stream reached by a bad `Accept` negotiation never ends) would hold a socket per failing poll |
| In `streamMode: 'events'`, an `id:` or `retry:` with no frame to ride on is carried into the next connect | The core's own parser reads both per chunk in `'chunks'` mode; framing here would otherwise drop a cursor advance or a server backoff hint |
| No deadline of its own | The core bounds every wait (`pollTimeoutMs`, `connectTimeoutMs`) through the `signal` it passes |
| Header source resolved per request | What makes the one retry `onAuthChallenge` grants actually carry a refreshed token |
| Abort ends stream iteration quietly; a mid-stream death throws | The core aborts on purpose (stale watchdog, stop); a real failure has to surface so it backs off and polls |

### Why not build it on `sendByApiContract`?

Two things a fallback subscription needs are outside what a one-shot contract request can express,
and both would fail silently rather than loudly:

- **The per-frame `id:`.** `sendByApiContract`'s SSE mode yields `lastEventId`, the *sticky*
  cursor, and no per-frame id. The core's default version extractor reads the frame's own id, so
  handing it a sticky cursor would make every id-less frame look like a repeat of the previous
  version — and the version gate would drop it.
- **Raw bytes.** Comment frames (`: heartbeat`) are consumed by any framing that yields events, so
  the core's stale-connection watchdog would degrade from byte-level to event-level and a silently
  dead connection would go unnoticed for a full timeout.

`createFallbackTransport` therefore reads the response body itself and hands the core raw text,
while reusing the same contract schemas, header handling and path building. `Last-Event-ID` is
likewise a transport-level header rather than a contract-declared one.

### Validation

Passing `contract` turns on the checks this package exists for:

- **Snapshots** are parsed with the contract's JSON schema for the responding status. A violation
  **rejects** the poll (`FallbackSnapshotValidationError`) rather than reaching
  `version.ofSnapshot` — a wrong watermark silently drops every later event, and a poll failure
  is merely retried.
- **SSE payloads** are checked against the contract's `sseResponse` event schemas, per
  `eventValidation`:

| `eventValidation` | Effect | Requires |
|---|---|---|
| `'report'` (default when the contract declares SSE events) | Reports to `diagnostics.onEventSchemaError`; the frame is still delivered | — |
| `'drop'` | The frame never reaches the core **and the stream ends**, so the watermark stays below the hole and the repair snapshot lands above it | `streamMode: 'events'` |
| `'off'` | No checking | — |

`'drop'` needs `streamMode: 'events'` because that is where framing happens before the core sees
anything. With raw chunks the core frames the stream itself, so by the time a payload could be
withheld its version has already been gated — and the repair poll would read the snapshot as a
duplicate and drop it.

Ending the stream is the other half of `'drop'`, not an implementation detail: withholding one
frame while delivering the next lets the core's watermark advance past the hole, and the repair
poll then arrives at or below that watermark, where the reconciler treats it as a stale duplicate
and synthesizes nothing. The withheld event would be lost for good. The cost is a reconnect per
rejected payload — which is proportionate, since a stream emitting bodies its own contract rejects
is broken, and polling carries the subscription meanwhile.

`'events'` has two costs of its own, which is why `'chunks'` + `'report'` is the default: comment
frames are consumed by the framing, so the stale-connection watchdog drops from byte-level to
event-level; and an `id:` or `retry:` arriving with no `data:` reaches the core only if a later
frame on the same connection carries it out, whereas the core's own parser reads both per chunk.
Neither loses data — an unreported cursor replays events the version gate then dedupes, and an
unreported `retry:` leaves the core on its own backoff. A cursor advance the core would
otherwise miss is not part of that cost: an `id:` or `retry:` that no frame carried is inherited by
the next connect, except past a frame `'drop'` withheld — replaying from there would skip for good
the very event the repair poll is owed.

An event the contract does not declare is reported to `diagnostics.onUndeclaredEvent` and never
dropped: it usually means a newer server, not a broken one.

### Adopting before the SSE endpoint exists

The transport is happy with a contract that has only a JSON branch — pair it with the core's
`policy.mode: 'poll-only'` (or `POLL_ONLY_POLICY`), which never opens a stream. The binding,
version gate and state machine are the ones the streaming rollout will use, so turning SSE on
later is a config change rather than a second migration. Point `snapshotContract` at the poll
contract if the dual-mode one does not exist yet, or use `snapshotContract` + `streamContract`
when the two channels live on separate routes.

### Acceptance gate

The unit suite covers the adapter in isolation. `test/verifyWithCore.mjs` covers the seam — the
adapter driving the real client core against a real HTTP server — so a change here cannot quietly
break what the core relies on. Because the core is optional, the gate is opt-in:

```sh
pnpm add -D @opinionated-machine/sse-fallback
pnpm run build && pnpm run test:core
```

It asserts, end to end: SSE delivery with subscribe-first hydration; a deadman poll repairing an
event the live stream never sent; `Last-Event-ID` resuming after a drop; `onAuthChallenge`
recovery picking up a freshly resolved token; `poll-only` never opening a stream; a schema-invalid
snapshot being a retried poll failure rather than a poisoned watermark; and
`eventValidation: 'drop'` withholding a bad payload while a valid delta still applies.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `contract` | `ApiContract` | — | Dual-mode contract used by both channels; supplying it enables validation |
| `snapshotContract` / `streamContract` | `ApiContract` | `contract` | Per-channel contracts, when the poll and the stream live on separate routes |
| `pathPrefix` | `string` | — | Prefix prepended to both channels' paths |
| `headers` | `object \| () => object \| () => Promise<object>` | — | Headers added to every request, resolved fresh per request |
| `snapshotAccept` | `string` | `'application/json'` | `Accept` sent on the poll; override only for a vendored JSON media type |
| `validateSnapshot` | `boolean` | `true` | Validate snapshot bodies against the contract schema |
| `strictContentType` | `boolean` | `true` | Require the snapshot `content-type` to match a declared representation |
| `streamMode` | `'chunks' \| 'events'` | `'chunks'` | Raw text framed by the core, or frames framed here |
| `eventValidation` | `'off' \| 'report' \| 'drop'` | `'report'` when SSE schemas are declared | See above |
| `diagnostics` | `FallbackTransportDiagnostics` | — | `onSnapshot`, `onStreamOpen`, `onEventSchemaError`, `onUndeclaredEvent` |

### Errors

| Error | Raised when |
|---|---|
| `FallbackTransportError` | Base class; also the network-failure and unsupported-method case. Carries `channel` (`'poll'` / `'stream'`), `path` and `status` |
| `FallbackSnapshotValidationError` | A snapshot body violated the contract schema; carries `issues` |
| `FallbackUnexpectedSnapshotError` | The poll branch answered with something that cannot be a snapshot — an undeclared content type, an SSE stream (the `Accept` negotiation went wrong), a binary body, no body, or invalid JSON. Carries `contentType` and `bodyPreview` |
| `FallbackEventValidationError` | An SSE payload failed its schema, or was not JSON. Never thrown — reported to `diagnostics.onEventSchemaError` |
| `FallbackParamsValidationError` | `buildFallbackParams` was given params the contract's request schemas reject. Headers are checked too, but only the ones supplied — the rest come from the transport's `headers` option |
| `FallbackUnsupportedParamError` | A query parameter is a list or a structured value; a subscription request's query is a flat string map. A schema that parses a query string into a `Date` is not one of these: the value you supplied is sent, exactly as `sendByApiContract` would |

## Credits

This library is brought to you by a joint effort of Lokalise engineers:

- [Ondrej Sevcik](https://github.com/ondrejsevcik)
- [Szymon Chudy](https://github.com/szymonchudy)
- [Nivedita Bhat](https://github.com/NiveditaBhat)
- [Arthur Suermondt](https://github.com/arthuracs)
- [Lauris Mikāls](https://github.com/laurismikals)
- [Oskar Kupski](https://github.com/oskarski)
- [Igor Savin](https://github.com/kibertoad)
