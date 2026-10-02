# Changelog

## 13.0.0

### Major Changes

- 13dfb7d: Remove the deprecated contract definition API. `defineApiContract` is now the only way to define a contract; the `*ApiContract` functions in the client, server and testing packages are the only way to consume one.
  
  - `@lokalise/api-contracts`: removed `buildGetRoute`, `buildPayloadRoute`, `buildDeleteRoute`, `buildRestContract`, `buildContract`, `buildSseContract`, `mapRouteToPath`, `describeContract` and the legacy types (`CommonRouteDefinition`, `GetRouteDefinition`, `PayloadRouteDefinition`, `DeleteRouteDefinition`, `*ContractConfig`, `SSEContractDefinition`, `AnySSEContractDefinition`, `DualModeContractDefinition`, `AnyDualModeContractDefinition`, `SSEMethod`, `SSEEventSchemas`, `AllContractEventNames`, `ExtractEventSchema`, `AllContractEvents`). Use `defineApiContract` with `sseResponse()` / `blobResponse()` / a `content` map instead; `SseSchemaByEventName` replaces `SSEEventSchemas`.
  - `@lokalise/backend-http-client`: removed `sendByGetRoute`, `sendByPayloadRoute`, `sendByDeleteRoute` and their `*WithStreamedResponse` variants.  Use `sendByApiContract`.
  - `@lokalise/frontend-http-client`: removed `sendByGetRoute`, `sendByPayloadRoute`, `sendByDeleteRoute`, `connectSseByContract` and the `SseCallbacks` / `SseConnection` / `SseRouteRequestParams` types. Use `sendByApiContract`, and `sseStreamToCallbacks` for callback-style SSE consumption. The plain `sendGet` / `sendPost` / `sendPut` / `sendPatch` / `sendDelete` now type `headers` as an object or a sync/async factory, matching `sendByApiContract`.
  - `@lokalise/fastify-api-contracts`: removed `buildFastifyRoute`, `buildFastifyRouteHandler`, `buildFastifyNoPayloadRoute`, `buildFastifyPayloadRoute`, their `*Handler` variants, `injectByContract`, `InjectByContractParams`, `injectGet` / `injectPost` / `injectPut` / `injectPatch` / `injectDelete`, and the `RouteType`, `FastifyPayloadHandlerFn`, `FastifyNoPayloadHandlerFn` types. Use `buildFastifyApiRoute` and `injectByApiContract`. `ApiContractMetadataToRouteMapper` now receives `ApiContract['metadata']`. The Fastify `FastifyContextConfig.apiContract` augmentation is now optional, since routes registered without `buildFastifyApiRoute` do not carry it; hooks reading it must narrow first.
  - `@lokalise/universal-testing-utils`: removed `MockttpHelper`, `MswHelper` and their `*MockParams*`, `SseEventController`, `SseMockEvent` types. Use `ApiContractMockttpHelper` and `ApiContractMswHelper`.
  
  `RoutePathResolver` (the `pathResolver` field) must now return a path starting with `/`, typed as `` `/${string}` ``. Inline literals and template strings infer correctly; resolvers that return a plain `string` (e.g. from a shared path helper) need to return `` `/${string}` `` instead.
  
  `@lokalise/api-contracts` now exports its type utilities (`Prettify`, `IsUnion`, `Exactly`, `KeysOfUnion`, `DistributiveOmit`, `ValueOf`), a `resolveHeadersParam` helper that the clients and the Fastify injector share for resolving `HeadersParam` factories, and gains framework-agnostic server types next to the client ones: `InferServerRequest`, `InferServerResponse`, `InferServerResponseContentTypes`, `InferServerSseSelections`, `InferServerStatusesForKey`, `ServerSseSelection`, `SseMessage` and `SseStreamMessage`. `@lokalise/fastify-api-contracts` now builds `InferApiHandlerRequest`, `InferApiHandlerResult`, `InferContractResponseContentTypes`, `SSEMessage`, `SSEStreamMessage` and `SSESelection` on top of them; those names are unchanged.
  
  All consumer packages now require `@lokalise/api-contracts@>=9.0.0`.

## 12.2.0

### Minor Changes

- 07d9573: Export `TRANSPORT_ERROR_CODES` (the authoritative transport-error code list, previously internal) and the `HttpClient` type (the handle returned by `buildClient`), so consumers can iterate the code list instead of copying it and can type client instances without importing `Client` from `undici` directly.

## 12.1.0

### Minor Changes

- e64f7c2: Add `isTransportError` and `getTransportErrorCode` helpers detecting transport-level request failures without an HTTP response (undici timeouts and socket errors, connection refused/reset, DNS backoff), including errors wrapped in a `cause` chain. Useful for classifying such failures as retryable.

## 12.0.1

### Patch Changes

- 2ae86ff: Raise the `@lokalise/api-contracts` peer dependency floor to `>=7.2.0`, the first version where
  contract `visibility` exists. Older floors were already inaccurate — the packages reference types
  introduced in the 7.x line — and pre-7.2 peers cannot resolve the visibility-aware compatibility
  types.

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
