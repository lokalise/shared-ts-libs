---
"@lokalise/fastify-api-contracts": minor
---

Propagate the contract's `tags` into the Fastify route schema in `buildFastifyRoute`, `buildFastifyNoPayloadRoute` and `buildFastifyPayloadRoute`, so contracts built with `buildRestContract({ tags: [...] })` produce tagged operations in the generated OpenAPI spec.

Previously only `summary` and `description` were mapped, so `@fastify/swagger` — which reads operation tags from `schema.tags` — grouped every such route under `default`. `ExtendedFastifySchema` now declares the `tags` field; contracts without `tags` are unaffected (the field is dropped by `copyWithoutUndefined` as before).
