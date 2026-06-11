---
"@lokalise/api-contracts": patch
---

Type `pathResolver`'s parameter as `undefined` in `defineApiContract` when no `requestPathParamsSchema` is provided, matching the runtime call. Previously the parameter fell back to a loose `Record<string, unknown>`, allowing resolvers to read path params that are `undefined` at runtime.
