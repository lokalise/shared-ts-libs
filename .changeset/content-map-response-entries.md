---
"@lokalise/api-contracts": minor
---

Add content-map response entries: a status code can now map to a `{ content }` object keyed by media type, exposing several media types at once — including multiple JSON variants (e.g. `application/json` and `application/json+01`) — each disambiguated by exact content-type matching. A JSON body is a bare Zod schema (e.g. `{ content: { 'application/json': mySchema } }`); use `blobBody()` / `sseBody()` for binary and SSE bodies. A `{ content }` entry may set `allowNoBody: true` to additionally accept an empty body, and a no-body entry is `{ allowNoBody: true }`. Guards: `isContentResponseEntry`/`isBlobBody`/`isSseBody`/`isJsonBody`.

Client response inference (`InferNonSseClientResponse` / `InferSseClientResponse`) tags each content-map member with its matched `contentType` so consumers can narrow on it. This is fully additive: the existing per-status values (bare Zod schema, `textResponse`, `blobResponse`, `sseResponse`, `noBodyResponse`, `anyOfResponses`, `ContractNoBody`) are unchanged and may be freely mixed with content-map entries across status codes.
