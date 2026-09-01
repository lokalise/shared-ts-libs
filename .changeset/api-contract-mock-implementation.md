---
"@lokalise/universal-testing-utils": minor
---

Add `mockResponseWithImplementation` to `ApiContractMockttpHelper` and `ApiContractMswHelper`, so
`defineApiContract` contracts can be mocked with a body computed from the incoming request. Until
now this only existed as `MswHelper.mockValidResponseWithImplementation`, which is tied to the
legacy `buildRestContract`/`buildSseContract` definitions, so the only option for a new-style
contract was a fixed `mockResponse` body.

`responseStatus` selects the contract entry, which types `handleRequest`'s return value and
supplies the schema its result is validated against. Both helpers also gain a static `response()`
for overriding the status on a single call, sharing the wrapper with `MswHelper.response()`.
