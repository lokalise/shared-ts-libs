# @lokalise/errors

Strongly-typed, nominal error classes for Lokalise services.

## The problem this solves

TypeScript's structural type system means two error classes with identical shapes
are assignable to each other, so mistakes like returning the wrong error go
undetected at compile time:

```ts
// Without nominal typing — TS does NOT catch this
const getProject = (): Either<ProjectNotFoundError, Project> => {
  return failure(new ProjectConflictError('foo')) // wrong error, no TS error!
}
```

This package solves that by putting a string literal `code` on every error
class. TypeScript narrows on literal types, so cross-error assignments become
compile errors.

## Error hierarchy

```
BaseError (abstract)          — shared base: code, details, cause
├── InternalError (abstract)  — non-public operational errors
└── PublicError   (abstract)  — client-facing errors; has type + httpStatusCode
```

## InternalError

For runtime errors that should never be surfaced to clients (timeouts, lock
failures, unexpected states). Extend and `override readonly code`.

```ts
import { InternalError } from '@lokalise/errors'

// Without details
class TranslatorTimeoutError extends InternalError {
  override readonly code = 'TRANSLATOR_TIMEOUT'

  constructor(translatorId: string) {
    super({ message: `Translator ${translatorId} timed out` })
  }
}

// With typed details
class DatabaseQueryError extends InternalError<{ query: string }> {
  override readonly code = 'DATABASE_QUERY_ERROR'

  constructor(query: string, cause?: unknown) {
    super({ message: 'Database query failed', details: { query }, cause })
  }
}
```

## PublicError

For errors that may be surfaced to clients. Use the **`PublicError.from()`
factory** rather than extending and overriding `code`/`type` manually — the
factory bakes literal types in from the definition automatically, avoiding the
footgun of accidentally omitting `readonly` on an override.

Details are typed via an optional Zod schema, which also enables OpenAPI schema
generation on the contract layer.

```ts
import { z } from 'zod/v4'
import { PublicError, ErrorType, defineError } from '@lokalise/errors'

// 1. Define the error (reusable for OpenAPI contracts too)
const projectNotFoundDef = defineError({
  code: 'PROJECT_NOT_FOUND',
  type: ErrorType.NOT_FOUND,
  detailsSchema: z.object({ id: z.string() }),
})

// 2. Create the error class
class ProjectNotFoundError extends PublicError.from(projectNotFoundDef) {
  constructor(id: string) {
    super({ message: `Project ${id} not found`, details: { id } })
  }
}

// 3. Use it
const error = new ProjectNotFoundError('abc')
error.code           // 'PROJECT_NOT_FOUND'
error.type           // 'not-found'
error.httpStatusCode // 404
error.details        // { id: string }
```

Without a details schema, `details` is `undefined` and the constructor does not
accept a `details` field:

```ts
const rateLimitDef = defineError({ code: 'RATE_LIMIT_EXCEEDED', type: ErrorType.RATE_LIMIT })

class RateLimitError extends PublicError.from(rateLimitDef) {
  constructor() { super({ message: 'Too many requests' }) }
}
```

## Protocol mapping

`PublicError` instances expose `httpStatusCode` as a getter. For cases where
you only have an `ErrorType` value, use the standalone `toHttpStatus()` utility.

```ts
import { toHttpStatus } from '@lokalise/errors'

// On an instance
reply.status(error.httpStatusCode).send({ code: error.code, message: error.message })

// From an ErrorType value
reply.status(toHttpStatus(someType)).send(...)
```

| ErrorType           | HTTP |
|---------------------|------|
| `bad-request`       | 400  |
| `unauthenticated`   | 401  |
| `permission-denied` | 403  |
| `not-found`         | 404  |
| `conflict`          | 409  |
| `rate-limit`        | 429  |
| `internal`          | 500  |
| `unavailable`       | 503  |

For other protocols (gRPC, message queues) create a similar mapping using the
`ErrorType` values.

## Nominal typing guarantee

Because `code` is a string literal on every concrete class, TypeScript rejects
cross-error assignments:

```ts
const getProject = (): ProjectNotFoundError => {
  // TS error: Type '"PROJECT_NAME_ALREADY_EXISTS"' is not assignable to type '"PROJECT_NOT_FOUND"'
  return new ProjectNameAlreadyExistsError('foo')
}
```

> **Note for `InternalError`:** Always declare `code` as `override readonly`.
> Omitting `readonly` widens the literal type and breaks TS discrimination.
> This is the reason `PublicError` uses the factory pattern — it preserves
> literal types automatically with no risk of the footgun.
