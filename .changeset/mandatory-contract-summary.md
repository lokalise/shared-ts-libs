---
"@lokalise/api-contracts": major
"@lokalise/frontend-http-client": major
"@lokalise/backend-http-client": major
---

Make the contract `summary` field mandatory on `defineApiContract`, and surface it in the http-client `UnexpectedResponseError` for debugging.

- `summary` is now required on every contract (previously optional).
- `UnexpectedResponseError` (fe + be) gains a required `summary` constructor argument and a `readonly summary` field, and includes it in the error message (`Unexpected response for "<summary>": …`). `sendByApiContract` passes `contract.summary` through automatically.
