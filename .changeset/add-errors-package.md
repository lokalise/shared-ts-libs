---
"@lokalise/errors": major
---

Initial release of `@lokalise/errors`, strongly-typed nominal error classes for TypeScript applications.

- `InternalError` for non-public operational errors, created via `InternalError.from(code)` or inline with `InternalError.create()`
- `PublicError` for client-facing errors, bound to a reusable `definePublicError()` definition with an `ErrorType` category, derived `httpStatusCode`, and optional Zod-typed `details`
- Literal `code` types on every error class, enabling compile-time detection of returning the wrong error and discriminating error unions by `code`
- `isInstance` type guards that work across realms and duplicated package copies
- `toPayload()` producing the client-safe payload matching the definition's companion schema
- `mergeErrorSchemasByStatusCode()` for spreading error schemas into `@lokalise/api-contracts` responses
- Backward compatible with `@lokalise/node-core` errors via the deprecated `errorCode` alias