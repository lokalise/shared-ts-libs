---
"@lokalise/fastify-api-contracts": major
---

Unify OpenAPI visibility handling to fail closed: `buildFastifyRoute` and `buildFastifyApiSchema`
now hide any route whose contract `visibility` is not explicitly `'public'` (`hide: visibility !==
'public'`), matching the existing `buildFastify*Route` handlers.

Behavior change: with the `?? 'public'` fallback removed from every `@lokalise/api-contracts`
builder, a contract whose `visibility` is `undefined` at runtime — e.g. built by a plain-JS
consumer, a hand-written contract literal cast to the contract type, or a contract package
compiled against pre-visibility `@lokalise/api-contracts` (<7.2) — is now **excluded from the
generated OpenAPI document** instead of being exposed. This is intentional: an unclassified
route stays private until its visibility is declared. Set `visibility: 'public'` explicitly to
publish such routes.
