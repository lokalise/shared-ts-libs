---
"@lokalise/universal-testing-utils": minor
---

Support content-map response entries in `ApiContractMockttpHelper`. Previously a contract using a content-map entry (`{ content: { '<media-type>': descriptor } }` or `{ allowNoBody: true }`) compiled but threw `responseEntry.parse is not a function` at runtime, since `mockResponse` only handled the legacy response forms. The helper now resolves content-map entries — serving SSE when negotiated via `Accept`, otherwise JSON (schema-parsed), blob, or an empty body — each with the matched media type as the `content-type` header. `MockResponseParams` now infers the right body field(s) (`responseJson` / `events` / `responseBlob`) for a content-map entry's descriptors.
