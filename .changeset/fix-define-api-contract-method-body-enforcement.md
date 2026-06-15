---
"@lokalise/api-contracts": patch
---

Fix `defineApiContract` not enforcing method/body rules: a non-distributive `Omit` collapsed the `ApiContract` discriminated union, allowing GET/DELETE contracts with a `requestBodySchema` and POST/PUT/PATCH contracts without one. Both are now compile-time errors.
