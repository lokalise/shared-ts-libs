---
"@lokalise/api-contracts": patch
---

Accept contracts compiled against api-contracts <9 wherever an `ApiContract` is expected.

Their emitted types declare `pathResolver` as returning `string`, while 9.0.0 made
`ApiContract` require `` `/${string}` ``, so passing them to `sendByApiContract`,
`injectByApiContract` or the contract mock helpers failed to typecheck and inferred
`unknown` response bodies. `ApiContract` accepts a plain `string` again; `defineApiContract`
still requires the leading slash, and `buildRequestPath` normalizes the path at runtime.
