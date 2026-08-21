---
"@lokalise/backend-http-client": patch
"@lokalise/frontend-http-client": patch
"@lokalise/universal-testing-utils": patch
---

Raise the `@lokalise/api-contracts` peer dependency floor to `>=7.2.0`, the first version where
contract `visibility` exists. Older floors were already inaccurate — the packages reference types
introduced in the 7.x line — and pre-7.2 peers cannot resolve the visibility-aware compatibility
types.
