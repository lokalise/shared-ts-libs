---
"@lokalise/api-contracts": patch
---

Treat tagged `noBodyResponse()` the same as the `ContractNoBody` symbol in type-level inference: `IsNoBodySuccessResponse` now returns `true`, `AvailableResponseModes` includes `'noContent'`, and client response inference maps the body to `null` instead of `never`.
