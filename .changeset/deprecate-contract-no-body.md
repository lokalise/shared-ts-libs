---
"@lokalise/api-contracts": minor
---

Deprecate the `ContractNoBody` symbol in favour of plain values that need no import. Use `null` as the `requestBodySchema` sentinel for POST/PUT/PATCH contracts with no body, and `noBodyResponse()` for no-body response entries. `requestBodySchema` now accepts `null` while preserving the "POST/PUT/PATCH must declare body intent" enforcement. `ContractNoBody` continues to work and will be removed in a future major release.
