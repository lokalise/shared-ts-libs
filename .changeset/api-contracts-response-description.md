---
"@lokalise/api-contracts": minor
---

Add optional `description` field to all response factories for OpenAPI spec support. New `noBodyResponse()` factory and `isNoBodyResponse()` type guard replace `ContractNoBody` in `responsesByStatusCode`. Shared `ResponseOptions` type accepted by `textResponse`, `blobResponse`, `sseResponse`, `anyOfResponses`, and `noBodyResponse`.
