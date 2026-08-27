# @lokalise/errors

Strongly-typed, nominal error classes for TypeScript applications.

## The problem this solves

TypeScript's structural type system treats two error classes with identical
shapes as assignable to each other, so returning the wrong error goes
undetected at compile time:

```ts
// Without nominal typing, TS does NOT catch this
const getProjectError = (): ProjectNotFoundError => {
  return new ProjectConflictError('foo') // wrong error, no TS error!
}
```

This package puts a string literal `code` on every error class. TypeScript
narrows on literal types, so cross-error assignments become compile errors:

```ts
const getProjectError = (): ProjectNotFoundError => {
  // TS error: Type '"PROJECT_CONFLICT"' is not assignable to type '"PROJECT_NOT_FOUND"'
  return new ProjectConflictError('foo')
}
```

The guarantee only holds while `code` stays a literal type. A hand-written
subclass would have to declare `code` as `override readonly` itself, and
omitting `readonly` widens the literal to `string` without a compile error,
silently turning the check off. This is why both base classes keep their
constructors private: the `from()` factories are the only way to create
concrete classes, and they preserve the literal automatically.

## Installation

```bash
npm install @lokalise/errors zod
```

`zod` is a peer dependency, used to type the details of public errors.

## Error hierarchy

```text
EnhancedError (not exported)   shared base: code, details, cause, cross-realm isInstance
├── InternalError              non-public operational errors; create via InternalError.from()
└── PublicError                client-facing errors with type + httpStatusCode; create via PublicError.from()
```

## InternalError

For runtime errors that should never reach clients (timeouts, lock failures,
unexpected states). Create classes with the `InternalError.from()` factory:

```ts
import { InternalError } from '@lokalise/errors'

// Without details
class TranslatorTimeoutError extends InternalError.from('TRANSLATOR_TIMEOUT') {
  constructor(translatorId: string) {
    super({ message: `Translator ${translatorId} timed out` })
  }
}

// With typed details, passed as a type argument
class DatabaseQueryError extends InternalError.from('DATABASE_QUERY_ERROR')<{ query: string }> {
  constructor(query: string, cause?: unknown) {
    super({ message: 'Database query failed', details: { query }, cause })
  }
}
```

The factory result can also be used directly when no custom constructor is
needed:

```ts
const TranslatorTimeoutError = InternalError.from('TRANSLATOR_TIMEOUT')
throw new TranslatorTimeoutError({ message: 'Translator t-1 timed out' })
```

## PublicError

For errors that may be surfaced to clients. Creation is two-step:
`definePublicError()` builds a reusable definition (code, error category, and
an optional Zod schema for details), and `PublicError.from()` binds it to a
class. Internal errors skip the define step because a code string is their
whole definition. Public errors carry more, and the definition object is
reused by the contract tooling described below.

```ts
import { z } from 'zod'
import { PublicError, ErrorType, definePublicError } from '@lokalise/errors'

// 1. Define the error (reusable for OpenAPI contracts too)
const projectNotFoundErrorDefinition = definePublicError({
  code: 'PROJECT_NOT_FOUND',
  type: ErrorType.NOT_FOUND,
  detailsSchema: z.object({ id: z.string() }),
})

// 2. Create the error class
class ProjectNotFoundError extends PublicError.from(projectNotFoundErrorDefinition) {
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
const rateLimitErrorDefinition = definePublicError({ code: 'RATE_LIMIT_EXCEEDED', type: ErrorType.RATE_LIMIT })

class RateLimitError extends PublicError.from(rateLimitErrorDefinition) {
  constructor() { super({ message: 'Too many requests' }) }
}
```

### Serializing to a client-facing payload

`toPayload()` returns the part of the error that is safe to send to clients:
`message`, `code`, and `details` when the definition declares a
`detailsSchema`. Non-public fields (`stack`, `cause`, `name`) are never
included.

```ts
new ProjectNotFoundError('abc').toPayload()
// { message: 'Project abc not found', code: 'PROJECT_NOT_FOUND', errorCode: 'PROJECT_NOT_FOUND', details: { id: 'abc' } }

new RateLimitError().toPayload()
// { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED', errorCode: 'RATE_LIMIT_EXCEEDED' }
// note: no details key
```

The return type (`PublicErrorPayload`) keeps `code` as a literal and `details`
typed. The payload always satisfies the definition's companion `schema`, so
servers can respond with it directly and clients can parse responses with the
schema:

```ts
reply.status(error.httpStatusCode).send(error.toPayload())
```

### The deprecated `errorCode` alias

To ease migrating consumers of `@lokalise/node-core` errors, every error also
exposes a deprecated `errorCode` getter that mirrors `code`. It appears in
`toPayload()` output. The companion `schema` includes it as a required field
marked `deprecated` in its metadata (`.meta({ deprecated: true })`), so
generated OpenAPI output flags it accordingly.

Do not use `errorCode` in new code; read `code` instead. The alias will be
removed in a future major version once the node-core migration is complete.
Note it is a getter, so it does not appear in `JSON.stringify(error)` or
own-property log serializers. Log pipelines keyed on `errorCode` should move
to `code`.

### Response schemas by status code (API contracts)

`mergeErrorSchemasByStatusCode()` groups public error definitions by the HTTP
status code derived from their `type` and returns `{ [statusCode]: payloadSchema }`,
ready to be spread into an API contract's `responsesByStatusCode`
(`@lokalise/api-contracts`):

```ts
import { mergeErrorSchemasByStatusCode } from '@lokalise/errors'
import { defineApiContract } from '@lokalise/api-contracts'

const getProjectContract = defineApiContract({
  method: 'get',
  summary: 'Get project',
  visibility: 'public',
  requestPathParamsSchema: z.object({ id: z.string() }),
  pathResolver: ({ id }) => `/projects/${id}`,
  responsesByStatusCode: {
    200: projectSchema,
    ...mergeErrorSchemasByStatusCode([
      projectNotFoundErrorDefinition, // not-found  → 404
      projectNameAlreadyExistsErrorDefinition, // conflict → 409
      projectLockedErrorDefinition, // conflict → 409
    ]),
    // → { 404: <PROJECT_NOT_FOUND schema>,
    //     409: z.discriminatedUnion('code', [<PROJECT_NAME_ALREADY_EXISTS>, <PROJECT_LOCKED>]) }
  },
})
```

Behavior:

- A status code claimed by a single definition maps to that definition's
  `schema` as-is.
- A status code shared by several definitions maps to a
  `z.discriminatedUnion('code', ...)` of their schemas, so error codes must be
  unique within a status code. A duplicate code throws at merge time, i.e.
  when the contract is defined, not on the first parse.
- Both the status code keys and the payload types are preserved at the type
  level. `z.infer` of a mapped schema yields the payload union with literal
  `code` and typed `details`, letting contract consumers discriminate error
  responses by `code`. Accessing a status code no definition maps to is a
  compile error.

Combined with `toPayload()`, the server response provably matches the
contract. The payload an error serializes to is exactly what the mapped
schema validates.

## Protocol mapping

`PublicError` instances expose `httpStatusCode` as a getter. For cases where
you only have an `ErrorType` value, use the exported `httpStatusByErrorType` map.

```ts
import { httpStatusByErrorType } from '@lokalise/errors'

// On an instance
reply.status(error.httpStatusCode).send(error.toPayload())

// From an ErrorType value
reply.status(httpStatusByErrorType[someType]).send(payload)
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

## Checking errors with `isInstance`

Every error class has a static `isInstance()` type guard, the preferred way to
check errors from this package:

```ts
try {
  // ...
} catch (err) {
  if (PublicError.isInstance(err)) {
    return reply.status(err.httpStatusCode).send(err.toPayload())
  }
  if (InternalError.isInstance(err)) {
    logger.error({ code: err.code, details: err.details })
  }
  throw err
}
```

Every subclass inherits `isInstance`, and the guard narrows to the class it is
called on. Custom error classes get their own fully-typed guard with no extra
code. Using the `DatabaseQueryError` class defined earlier:

```ts
if (DatabaseQueryError.isInstance(err)) {
  err.details.query // narrowed to DatabaseQueryError, typed as string
}
```

Do not use the `instanceof` operator. It currently runs the same check at
runtime, because the package overrides `Symbol.hasInstance` (see
[How it works](#how-it-works)), but consider that behavior deprecated: the
override may be removed in a future release, at which point `instanceof`
silently reverts to prototype-chain checks that fail across realms and
package copies. `isInstance` is the supported API.

Override `isInstance` in a subclass only if you need custom matching logic;
the default inherited guard covers the standard cases.

## How it works

### Cross-realm identity via `Symbol.for`

On instantiation each error tags itself with `Symbol.for` symbols derived from
its inheritance path, e.g.
`'@lokalise/errors.EnhancedError.InternalError.TranslatorTimeoutError'`.
`isInstance` checks for those symbols instead of walking the prototype chain.
Because `Symbol.for` symbols are shared globally, `isInstance` keeps working
across realms and across duplicated copies of this package in `node_modules`,
situations where prototype-based checks silently fail.

### Class naming rules

The symbols are derived from class names and inheritance structure; they *are*
the cross-realm identity. This has a few consequences:

- **Renaming is a breaking change.** Renaming an error class (or moving it in
  the hierarchy) changes its identity: errors stamped by an older copy of the
  code stop matching `isInstance` checks in a newer copy, and vice versa. What
  looks like a pure refactor (`NotFoundError` → `ResourceNotFoundError`)
  changes runtime behavior across these boundaries.
- **Same name + same path = same class.** Two classes with the same name and
  inheritance path match each other's `isInstance`. That is deliberate, since
  it is what makes duplicated package copies interoperable, but it also means
  unrelated classes that happen to share a name and path are indistinguishable.
  Keep concrete error class names unique across your codebase.
- **Names must survive to runtime.** Minifiers that mangle class names (terser
  without `keep_classnames`, esbuild `--minify` without `--keep-names`) mangle
  each bundle independently. That silently breaks `isInstance` across realms
  and package copies, and can even make unrelated classes collide on the same
  mangled name. A single consistently-minified bundle keeps working.
- **Every class in the chain must have a name.** An anonymous class has nothing
  stable to derive an identity from, so constructing an error with an unnamed
  class in its hierarchy throws. Class expressions returned from factories are
  unnamed; name them explicitly:

  ```ts
  Object.defineProperty(TheClass, 'name', { value: 'TheClass' })
  ```

  Avoid `.` in such custom names. It is the path delimiter, so a class named
  `'Foo.Bar'` produces the same identity as a `Foo` → `Bar` inheritance chain.
