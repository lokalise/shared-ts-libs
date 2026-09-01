---
"@lokalise/universal-testing-utils": minor
---

Add `mockResponseWithImplementation` to `ApiContractMockttpHelper` and `ApiContractMswHelper`, so
`defineApiContract` contracts can be mocked with a body computed from the incoming request. Until
now this only existed as `MswHelper.mockValidResponseWithImplementation`, which is tied to the
legacy `buildRestContract`/`buildSseContract` definitions, so the only option for a new-style
contract was a fixed `mockResponse` body.

`responseStatus` selects the contract entry, which types `handleRequest`'s return value and
supplies the schema its result is validated against. `contentType` picks between JSON media types
when the entry declares more than one, and the reply carries the media type the contract declared
it under, so an `application/problem+json` entry is not flattened to `application/json`. The
handler's request argument is typed from the contract's `requestBodySchema`.

Both helpers also gain a static `response()` for overriding the status on a single call, sharing
the wrapper with `MswHelper.response()`. An overridden status is resolved against its own contract
entry, so the wrapped body is validated against the schema for the status actually sent. Handler
and validation failures are reported through `console.error` and a labelled 500 rather than the
opaque one mockttp and msw produce for a throwing route callback.
