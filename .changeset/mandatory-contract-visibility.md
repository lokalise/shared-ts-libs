---
"@lokalise/api-contracts": major
---

Make `visibility` mandatory in every contract builder. `defineApiContract`, `buildContract`,
`buildRestContract`, `buildSseContract`, and the legacy `buildGetRoute` / `buildPayloadRoute` /
`buildDeleteRoute` no longer default it to `'public'` — an explicit `'public'` or `'internal'`
value is now required in every builder config.
