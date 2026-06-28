---
"@lokalise/api-contracts": minor
---

Add content-map response entries: a status code can now map to a `{ content }` object keyed by media type, exposing several media types at once — including multiple JSON variants (e.g. `application/json` and `application/json+01`) — each disambiguated by exact content-type matching. A JSON body is a bare Zod schema (e.g. `{ content: { 'application/json': mySchema } }`); use `blobBody()` / `sseBody()` for binary and SSE bodies. A `{ content }` entry may set `allowNoBody: true` to additionally accept an empty body, and a no-body entry is `{ allowNoBody: true }`. Guards: `isContentResponseEntry`/`isBlobBody`/`isSseBody`/`isJsonBody`.

Content-map members infer to the same `{ statusCode, headers, body }` shape as every other entry; the matched media type is not surfaced on the client response (read it from `headers['content-type']` when needed). `anyOfResponses` is deprecated in favour of content maps. This is fully additive: the existing per-status values (bare Zod schema, `textResponse`, `blobResponse`, `sseResponse`, `noBodyResponse`, `anyOfResponses`, `ContractNoBody`) are unchanged and may be freely mixed with content-map entries across status codes.
