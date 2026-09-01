# @lokalise/universal-testing-utils

## 4.2.0

### Minor Changes

- b1f3b51: Add `mockResponseWithImplementation` to `ApiContractMockttpHelper` and `ApiContractMswHelper`, so
  `defineApiContract` contracts can be mocked with a body computed from the incoming request. Until
  now this only existed as `MswHelper.mockValidResponseWithImplementation`, which is tied to the
  legacy `buildRestContract`/`buildSseContract` definitions, so the only option for a new-style
  contract was a fixed `mockResponse` body.
  
  `responseStatus` selects the contract entry, which types `handleRequest`'s return value and
  supplies the schema its result is validated against. `contentType` picks between JSON media types
  when the entry declares more than one, and the reply carries the media type the contract declared
  it under, so an `application/problem+json` entry is not flattened to `application/json`. The
  handler's request argument is typed from the contract's `requestBodySchema`.
  
  Both helpers also gain a static `response()` for overriding the status on a single call, sharing
  the wrapper with `MswHelper.response()`. An overridden status is resolved against its own contract
  entry, so the wrapped body is validated against the schema for the status actually sent. Handler
  and validation failures are reported through `console.error` and a labelled 500 rather than the
  opaque one mockttp and msw produce for a throwing route callback.

## 4.1.1

### Patch Changes

- 2ae86ff: Raise the `@lokalise/api-contracts` peer dependency floor to `>=7.2.0`, the first version where
  contract `visibility` exists. Older floors were already inaccurate — the packages reference types
  introduced in the 7.x line — and pre-7.2 peers cannot resolve the visibility-aware compatibility
  types.

## 4.1.0

### Minor Changes

- 4f11d14: Add ApiContractMswHelper — an MSW-based counterpart to ApiContractMockttpHelper for mocking new-style ApiContract responses (JSON, SSE, blob, dual-mode content maps, no-body entries, and range/default status-code keys).
- 4f11d14: Support explicit contentType selection in MockResponseParams for ApiContractMockttpHelper and ApiContractMswHelper. When a response entry declares multiple content types, passing contentType pins the mock to that single entry (skipping Accept negotiation) and only that entry's body field is required — making it possible to mock entries negotiation would never pick, such as a second JSON content type or a blob entry next to a JSON one.

## 4.0.0

### Major Changes

- dae7dc7: Remove the deprecated response APIs from the `defineApiContract` (new) API:

  - `textResponse` / `TypedTextResponse` / `isTextResponse` — use `blobResponse` (or a content-map `blobBody()` entry) and decode with `.text()` at the call site.
  - `anyOfResponses` / `AnyOfResponses` / `isAnyOfResponses` — use a content-map response entry (`{ content: { '<mediaType>': descriptor } }`).
  - `getSuccessResponseSchema`, `getIsEmptyResponseExpected`, `IsNoBodySuccessResponse` — had no known consumers.
  - The `'text'` `ResponseKind` variant is gone (kinds are now `noContent | blob | json | sse`).
  - `ContractNoBody` is now a **request-body-only** sentinel — it is no longer part of `ApiContractResponse` and cannot be used as a `responsesByStatusCode` entry. Use `noBodyResponse()` for no-body responses. (`ContractNoBody` remains valid as a `requestBodySchema` value.)
  - `noBodyResponse()`, `blobResponse()` and `sseResponse()` are kept as authoring helpers but now build **content-map entries** (`{ allowNoBody: true }` and `{ content: { … } }` respectively) instead of tagged objects — call sites are unchanged. The underlying tagged types and guards (`NoBodyResponse`, `TypedBlobResponse`, `TypedSseResponse`, `isNoBodyResponse`, `isBlobResponse`, `isSseResponse`) are removed; blob/SSE bodies live only in content maps, and JSON stays a bare Zod schema.

  The fe/be http clients no longer materialize `text` responses, and `ApiContractMockttpHelper` / `MockResponseParams` no longer accept `textResponse`/`anyOfResponses` entries (no `responseText` param). Content-map entries cover all of these cases.

  Blob responses are now delivered to the client as a lazy `BlobResponseHandle` (previously a buffered `Blob`), so the caller decides how to consume the body instead of the client buffering it unconditionally. The handle exposes `blob()` / `text()` / `arrayBuffer()` (buffer the whole body), `stream()` (raw `ReadableStream<Uint8Array>` for piping/backpressure), and `cancel()` (discard and release the connection). The underlying body is one-shot: the first accessor consumes it, a second throws. The materializing accessors delegate to each runtime's native drains (Fetch `Response` on the frontend, undici on the backend), which also release the connection.

## 3.9.0

### Minor Changes

- 5990b2c: Support content-map response entries in `ApiContractMockttpHelper`. Previously a contract using a content-map entry (`{ content: { '<media-type>': descriptor } }` or `{ allowNoBody: true }`) compiled but threw `responseEntry.parse is not a function` at runtime, since `mockResponse` only handled the legacy response forms. The helper now resolves content-map entries — serving SSE when negotiated via `Accept`, otherwise JSON (schema-parsed), blob, or an empty body — each with the matched media type as the `content-type` header. `MockResponseParams` now infers the right body field(s) (`responseJson` / `events` / `responseBlob`) for a content-map entry's descriptors.

## 3.8.0

### Minor Changes

- 1a227f6: Add `ApiContractMockttpHelper` for mocking HTTP responses with `defineApiContract`-based contracts in mockttp tests. Supports JSON, SSE, text, blob, no-body, and dual-mode responses with full type-safety, including range and wildcard status key resolution. Deprecate `MockttpHelper` in favour of the new helper.

## 3.7.0

### Minor Changes

- bf3bc10: `MockResponseParams` now accepts any concrete numeric status code covered by a contract's range key ('2xx', '4xx', 'default', …). `ApiContractMockttpHelper.mockResponse` resolves the contract entry with exact → range → 'default' precedence, mirroring the runtime lookup in `api-contracts`. Also handles `NoBodyResponse` (new in `api-contracts@6.13.0`) alongside `ContractNoBody`.

  Bumps minimum peer dependency to `@lokalise/api-contracts@6.13.0`.
