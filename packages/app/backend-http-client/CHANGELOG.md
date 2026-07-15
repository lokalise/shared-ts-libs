# Changelog

## 12.0.0

### Major Changes

- dae7dc7: Make the contract `summary` field mandatory on `defineApiContract`, and surface it in the http-client `UnexpectedResponseError` for debugging.

  - `summary` is now required on every contract (previously optional).
  - `UnexpectedResponseError` (fe + be) gains a required `summary` constructor argument and a `readonly summary` field, and includes it in the error message (`Unexpected response for "<summary>": …`). `sendByApiContract` passes `contract.summary` through automatically.

- dae7dc7: Remove the deprecated response APIs from the `defineApiContract` (new) API:

  - `textResponse` / `TypedTextResponse` / `isTextResponse` — use `blobResponse` (or a content-map `blobBody()` entry) and decode with `.text()` at the call site.
  - `anyOfResponses` / `AnyOfResponses` / `isAnyOfResponses` — use a content-map response entry (`{ content: { '<mediaType>': descriptor } }`).
  - `getSuccessResponseSchema`, `getIsEmptyResponseExpected`, `IsNoBodySuccessResponse` — had no known consumers.
  - The `'text'` `ResponseKind` variant is gone (kinds are now `noContent | blob | json | sse`).
  - `ContractNoBody` is now a **request-body-only** sentinel — it is no longer part of `ApiContractResponse` and cannot be used as a `responsesByStatusCode` entry. Use `noBodyResponse()` for no-body responses. (`ContractNoBody` remains valid as a `requestBodySchema` value.)
  - `noBodyResponse()`, `blobResponse()` and `sseResponse()` are kept as authoring helpers but now build **content-map entries** (`{ allowNoBody: true }` and `{ content: { … } }` respectively) instead of tagged objects — call sites are unchanged. The underlying tagged types and guards (`NoBodyResponse`, `TypedBlobResponse`, `TypedSseResponse`, `isNoBodyResponse`, `isBlobResponse`, `isSseResponse`) are removed; blob/SSE bodies live only in content maps, and JSON stays a bare Zod schema.

  The fe/be http clients no longer materialize `text` responses, and `ApiContractMockttpHelper` / `MockResponseParams` no longer accept `textResponse`/`anyOfResponses` entries (no `responseText` param). Content-map entries cover all of these cases.

  Blob responses are now delivered to the client as a lazy `BlobResponseHandle` (previously a buffered `Blob`), so the caller decides how to consume the body instead of the client buffering it unconditionally. The handle exposes `blob()` / `text()` / `arrayBuffer()` (buffer the whole body), `stream()` (raw `ReadableStream<Uint8Array>` for piping/backpressure), and `cancel()` (discard and release the connection). The underlying body is one-shot: the first accessor consumes it, a second throws. The materializing accessors delegate to each runtime's native drains (Fetch `Response` on the frontend, undici on the backend), which also release the connection.

## 11.2.0

### Minor Changes

- d6f099b: Add constantDelay, linearDelay, and exponentialDelay helpers for composing RetryConfig delay functions.

## [11.0.0] - 2026-05-08

### Remove `undici-retry` dependency

Replace `undici-retry` with an internal retry implementation. The following exports are removed:

- `DelayResolver` (type)
- `DEFAULT_RETRY_CONFIG`
- `createDefaultRetryResolver`
- `SendByApiContractRetryConfig` (type alias — use `RetryConfig` instead)

### `RetryConfig` shape changed

Migrate all `retryConfig` usages to the new field names:

| Before               | After                                    |
| -------------------- | ---------------------------------------- |
| `maxAttempts`        | `maxRetries`                             |
| `statusCodesToRetry` | `statusCodes`                            |
| `delayResolver`      | `delay: (retryNumber: number) => number` |
| `retryOnTimeout`     | `retryOnTimeout?` (default `true`)       |
| —                    | `maxDelay?` (default `30_000`)           |
| —                    | `maxJitter?` (default `100`)             |
| —                    | `respectRetryAfter?` (default `true`)    |
| —                    | `retryOnNetworkError?` (default `true`)  |

Pass `retryConfig: true` to enable retries with all defaults applied. Retries are now opt-in — no retries are performed unless `retryConfig` is explicitly set.

### `InternalRequestError` is now a class

`InternalRequestError` was previously a plain type intersection (`Error & { isInternalRequestError: true }`). It is now a class extending `Error`:

- The `isInternalRequestError: true` property is removed — use `instanceof InternalRequestError` or the exported `isInternalRequestError(err)` type guard
- `err.message` reflects the underlying cause's message when the cause is an `Error`
- `err.cause` holds the original error
- `InternalRequestError` is now a named export from the package root
- Cross-realm `instanceof` is supported via a `Symbol.for` brand

### `ResponseParseError` is now a public export

`ResponseParseError` is promoted from an internal class to a named export from the package root. Cross-realm `instanceof` is supported via a `Symbol.for` brand.
