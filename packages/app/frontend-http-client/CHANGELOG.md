# @lokalise/frontend-http-client

## 9.0.0

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

## 8.1.0

### Minor Changes

- bbefff6: Add `createFallbackTransport`, the HTTP adapter for `@opinionated-machine/sse-fallback`'s SSE-with-polling-fallback client: `fetchSnapshot` requests a contract's JSON branch and validates the snapshot against its schema, `openStream` requests the SSE branch, forwards `Last-Event-ID` on reconnect and yields raw text chunks so the core's byte-level liveness watchdog keeps working. Refusals resolve with their status so `unretryableStatuses` and `onAuthChallenge` can act on them, the header source is resolved fresh per request so a refreshed token reaches the retry, and SSE payloads are validated against the contract's event schemas (`eventValidation: 'report' | 'drop' | 'off'`). Ships with `buildFallbackParams` for contract-typed subscription params, `SseFramer`, and the `FallbackSnapshotOf` / `FallbackEventsOf` contract inference helpers. No new dependency: the transport seam is matched structurally.

## 8.0.1

### Patch Changes

- 2ae86ff: Raise the `@lokalise/api-contracts` peer dependency floor to `>=7.2.0`, the first version where
  contract `visibility` exists. Older floors were already inaccurate — the packages reference types
  introduced in the 7.x line — and pre-7.2 peers cannot resolve the visibility-aware compatibility
  types.

## 8.0.0

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
