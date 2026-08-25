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
EnhancedError (abstract, not exported) — shared base: code, details, cause, cross-realm instanceof
├── InternalError (abstract)  — non-public operational errors
└── PublicError   (abstract)  — client-facing errors; has type + httpStatusCode
```

### Reliable `instanceof` across realms and package copies

`EnhancedError` overrides `Symbol.hasInstance`: on instantiation each error tags
itself with `Symbol.for` symbols derived from its inheritance path (e.g.
`'@lokalise/errors.EnhancedError.InternalError.TranslatorTimeoutError'`), and `instanceof`
checks for those symbols instead of walking the prototype chain. Because
`Symbol.for` symbols are shared globally, `instanceof` keeps working across
realms (workers, VM contexts) and across duplicated copies of this package in
`node_modules` — situations where prototype-based `instanceof` silently fails.

### Class naming rules

The symbols are derived from **class names and inheritance structure** — they
*are* the cross-realm identity. This has a few consequences:

- **Renaming is a breaking change.** Renaming an error class (or moving it in
  the hierarchy) changes its identity: errors stamped by an older copy of the
  code stop matching `instanceof` checks in a newer copy, and vice versa. What
  looks like a pure refactor (`NotFoundError` → `ResourceNotFoundError`) changes
  runtime behavior across these boundaries.
- **Same name + same path = same class.** Two classes with the same name and
  inheritance path match each other's `instanceof`. That is deliberate — it is
  what makes duplicated package copies interoperable — but it also means
  unrelated classes that happen to share a name and path are indistinguishable.
  Keep concrete error class names unique across your codebase.
- **Names must survive to runtime.** Minifiers that mangle class names (terser
  without `keep_classnames`, esbuild `--minify` without `--keep-names`) mangle
  each bundle independently, silently breaking `instanceof` across realms and
  package copies — and can even make unrelated classes collide on the same
  mangled name. A single consistently-minified bundle keeps working, but that
  is exactly the case where plain prototype-based `instanceof` works anyway.
- **Every class in the chain must have a name.** An anonymous class has nothing
  stable to derive an identity from, so constructing an error with an unnamed
  class in its hierarchy throws. Class expressions returned from factories are
  unnamed — name them explicitly:

  ```ts
  Object.defineProperty(TheClass, 'name', { value: 'TheClass' })
  ```

  Avoid `.` in such custom names — it is the path delimiter, so a class named
  `'Foo.Bar'` produces the same identity as a `Foo` → `Bar` inheritance chain.

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
import { PublicError, ErrorType, definePublicError } from '@lokalise/errors'

// 1. Define the error (reusable for OpenAPI contracts too)
const projectNotFoundDef = definePublicError({
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
const rateLimitDef = definePublicError({ code: 'RATE_LIMIT_EXCEEDED', type: ErrorType.RATE_LIMIT })

class RateLimitError extends PublicError.from(rateLimitDef) {
  constructor() { super({ message: 'Too many requests' }) }
}
```

## Protocol mapping

`PublicError` instances expose `httpStatusCode` as a getter. For cases where
you only have an `ErrorType` value, use the exported `httpStatusByErrorType` map.

```ts
import { httpStatusByErrorType } from '@lokalise/errors'

// On an instance
reply.status(error.httpStatusCode).send({ code: error.code, message: error.message })

// From an ErrorType value
reply.status(httpStatusByErrorType[someType]).send(...)
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
| `unimplemented`     | 501  |
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
