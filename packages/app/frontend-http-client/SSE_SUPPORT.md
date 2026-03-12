# Plan: Add SSE Support to `frontend-http-client`

## Context

The library currently only handles sync HTTP requests via `sendByContract`. SSE and dual-mode contracts (built with `buildSseContract` in `@lokalise/api-contracts`) carry a `serverSentEventSchemas` field and are flagged with either `isSSE: true` or `isDualMode: true`. There is currently no way to open an SSE connection from a contract on the frontend.

Consuming apps pass a wretch instance that already has auth header middleware applied. The new function must accept the same wretch instance so auth flows through identically.

---

## What to build

A single new exported function: `connectSseByContract`.

### Signature

```typescript
connectSseByContract<
  Contract extends AnyDualModeContractDefinition | AnySSEContractDefinition,
  Events extends SSEEventSchemas = Contract['serverSentEventSchemas'],
>(
  wretch: WretchInstance,
  contract: Contract,
  params: SseRouteRequestParams<Contract>,
  callbacks: SseCallbacks<Events>,
): SseConnection
```

### Types

```typescript
// Returned handle — call close() to tear down the stream
export type SseConnection = {
  close: () => void
}

// Per-event callback map — each key gets its own typed handler
export type SseCallbacks<Events extends SSEEventSchemas> = {
  onEvent: {
    [K in keyof Events & string]: (data: z.infer<Events[K]>) => void
  }
  onError?: (error: Error) => void
  onOpen?: () => void
}

// Params follow the same conditional Mandatory pattern from types.ts
type AnyContract = AnyDualModeContractDefinition | AnySSEContractDefinition

export type SseRouteRequestParams<Contract extends AnyContract> = {
  pathParams: Contract['requestPathParamsSchema'] extends z.ZodTypeAny
    ? z.input<Contract['requestPathParamsSchema']>
    : never
  queryParams: Contract['requestQuerySchema'] extends z.ZodTypeAny
    ? z.input<Contract['requestQuerySchema']>
    : never
  body: Contract['requestBodySchema'] extends z.ZodTypeAny
    ? z.input<Contract['requestBodySchema']>
    : never
  headers: Contract['requestHeaderSchema'] extends z.ZodTypeAny
    ? z.input<Contract['requestHeaderSchema']>
      | (() => z.input<Contract['requestHeaderSchema']>)
      | (() => Promise<z.input<Contract['requestHeaderSchema']>>)
    : never
  pathPrefix?: string
} extends infer Mandatory
  ? { [K in keyof Mandatory as Mandatory[K] extends never ? never : K]: Mandatory[K] }
  : never
```

### Implementation outline

1. Resolve caller-provided `params.headers` (sync object, sync fn, or async fn — same `resolveHeaders` pattern from `client.ts`)
2. Merge resolved headers with `Accept: text/event-stream` and `Cache-Control: no-cache`
3. Build the path: `buildRequestPath(contract.pathResolver(params.pathParams), params.pathPrefix)` + serialised query string via existing `parseQueryParams`. Handle the `Either` result from `parseQueryParams` — if `isFailure(queryParams)`, call `callbacks.onError` and return early.
4. If the contract has a `requestBodySchema`, validate `params.body` via existing `parseRequestBody`. If `isFailure(body)`, call `callbacks.onError` and return early.
5. Create an `AbortController` — its signal is passed to fetch, `.abort()` is exposed as `close()`
6. Make the request via wretch:
   - GET: `wretch.headers(resolvedHeaders).get(path).res()`
   - POST/PUT/PATCH: `wretch.headers(resolvedHeaders)[method](validatedBody, path).res()`
   - `.res()` returns the raw `Response` with its `body: ReadableStream`
7. On successful response: call `callbacks.onOpen`
8. Pass `response.body` to `parseSseStream` async generator (see below)
9. For each yielded `{ event, data }`:
   - If `event` is not a key in `contract.serverSentEventSchemas` → skip (silently ignore unknown events)
   - Parse `data` as JSON, validate with `contract.serverSentEventSchemas[event]`
   - Call `callbacks.onEvent[event](validatedData)`
10. On JSON parse error or Zod validation failure → call `callbacks.onError`
11. On non-2xx response → call `callbacks.onError`

### New files

#### `src/utils/sseUtils.ts`

SSE wire-format parser. Async generator: `parseSseStream(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal)`.

The SSE wire format:
```
event: item.bulk.updated\n
data: {"items": [...]}\n
\n
```

Responsibilities:
- Decode chunks with `TextDecoder` (`stream: true`)
- Buffer partial lines; split on `\n` to process complete lines
- Track `currentEvent` (defaults to `"message"`) and `currentData` string
- `event:` line → set `currentEvent`
- `data:` line → append to `currentData` (supports multi-line data)
- Empty line → yield `{ event: currentEvent, data: currentData }` if data is non-empty, then reset
- On abort signal → release reader lock and return

#### `src/sse.ts`

Public function `connectSseByContract` plus all SSE-specific types (`SseConnection`, `SseCallbacks`, `SseRouteRequestParams`).

### Exports

Add to `src/index.ts`:

```typescript
export { connectSseByContract } from './sse.ts'
export type { SseConnection, SseCallbacks, SseRouteRequestParams } from './sse.ts'
```

---

## Tests

Add `src/sse.spec.ts` covering:

1. GET SSE contract — opens stream, parses named events, calls correct `onEvent` handler with validated data
2. GET dual-mode contract — same streaming behaviour
3. POST SSE contract — sends request body, handles streamed events
4. Unknown event name from server — silently ignored, no handler called
5. Invalid event data (fails Zod validation) — calls `onError`
6. JSON parse error in event data — calls `onError`
7. `close()` — aborts the underlying fetch, no further callbacks fired
8. `onOpen` called on successful connection
9. `onError` called on non-2xx response (e.g. 401)

Use `vi.fn()` for callbacks. Use `mockttp` (`getLocal()`) as the HTTP mock server — consistent with the existing `client.spec.ts` approach. Point wretch at the mock server URL rather than mocking fetch directly. Use mockttp's `.thenCallback()` to construct SSE response streams for integration-level tests.

---

## Scope — what does NOT change

- `client.ts` — existing `sendBy*` functions stay as-is
- `types.ts` — SSE types live in `sse.ts`
- `index.ts` — add new exports only
