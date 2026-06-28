# @lokalise/universal-testing-utils

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
