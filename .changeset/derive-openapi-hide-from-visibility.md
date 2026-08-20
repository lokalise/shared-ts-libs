---
"@lokalise/fastify-api-contracts": minor
---

Derive the fastify-swagger `schema.hide` flag from the contract's `visibility` field in every route builder (`buildFastifyRoute`, `buildFastifyApiRoute`/`buildFastifyApiSchema`, and the deprecated `buildFastifyNoPayloadRoute`/`buildFastifyPayloadRoute`): routes from `visibility: 'internal'` contracts are excluded from the generated OpenAPI document while still being registered and served.

- Route schemas now always carry an explicit `hide` boolean (`false` for public routes, previously absent). Behavior of generated docs is unchanged for public routes; downstream tests snapshotting route schemas will see the new key.
- Consumers needing the semantic value should read `config.apiContract.visibility` from the route, not the derived `hide` flag.
- The `@lokalise/api-contracts` peer dependency floor was raised to `>=7.2.0`, the first version whose contract builders stamp `visibility`.
- Removed the dead `describe` field from `ExtendedFastifySchema` and the route builders: nothing ever consumed it (`description` is the real OpenAPI field, which was already set alongside it).
