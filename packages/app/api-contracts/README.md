# api-contracts

API contracts are shared definitions that live in a shared package and are consumed by both the client and the backend. The contract describes a route — its path, HTTP method, and request/response schemas — and serves as the single source of truth for both sides.

The backend implements the route against the contract. The client uses the same contract to make type-safe requests without duplicating configuration. This eliminates assumptions across the boundary and keeps documentation, validation, and types in sync.

## Defining contracts

### REST routes

```ts
import { defineRouteContract, ContractNoBody } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

// GET with path params
const getUser = defineRouteContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: {
    200: z.object({ id: z.string(), name: z.string() }),
  },
})

// POST
const createUser = defineRouteContract({
  method: 'post',
  pathResolver: () => '/users',
  requestBodySchema: z.object({ name: z.string() }),
  responseSchemasByStatusCode: {
    201: z.object({ id: z.string(), name: z.string() }),
  },
})

// DELETE with no response body
const deleteUser = defineRouteContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: {
    204: ContractNoBody,
  },
})
```

### SSE and dual-mode routes

Add `serverSentEventSchemas` to define SSE event types. The presence of both `responseSchemasByStatusCode` (2xx) and `serverSentEventSchemas` makes the contract dual-mode.

| `responseSchemasByStatusCode` (2xx) | `serverSentEventSchemas` | Mode |
|---|---|---|
| ✅ | absent | REST |
| absent / symbols only | ✅ | SSE-only |
| ✅ | ✅ | Dual-mode (JSON + SSE) |

```ts
// SSE-only
const notifications = defineRouteContract({
  method: 'get',
  pathResolver: () => '/notifications/stream',
  serverSentEventSchemas: {
    notification: z.object({ id: z.string(), message: z.string() }),
  },
})

// Dual-mode: JSON response or SSE stream depending on Accept header
const chatCompletion = defineRouteContract({
  method: 'post',
  pathResolver: () => '/chat/completions',
  requestBodySchema: z.object({ message: z.string() }),
  responseSchemasByStatusCode: {
    200: z.object({ text: z.string() }),
  },
  serverSentEventSchemas: {
    chunk: z.object({ delta: z.string() }),
    done: z.object({ finish_reason: z.string() }),
  },
})
```

### Non-JSON and empty responses

Use `ContractNoBody` for responses with no body (e.g. 204), and `nonJsonResponse` for responses with a non-JSON body (CSV, binary, plain text, etc.).

`nonJsonResponse` carries both the content type and a Zod schema that describes the body type. This flows through `InferSuccessResponse` so the client gets a typed result instead of `unknown`.

```ts
import { defineRouteContract, ContractNoBody, nonJsonResponse } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

// Non-JSON response with explicit content type and body schema
const exportCsv = defineRouteContract({
  method: 'get',
  pathResolver: () => '/export.csv',
  responseSchemasByStatusCode: {
    200: nonJsonResponse({ contentType: 'text/csv', schema: z.string() }),
  },
})

// No body
const deleteUser = defineRouteContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: {
    204: ContractNoBody,
  },
})
```

`InferSuccessResponse` resolves the body type from `nonJsonResponse`:

```ts
type CsvBody = InferSuccessResponse<typeof exportCsv['responseSchemasByStatusCode']>
// string
```

### All fields

```ts
defineRouteContract({
  // Required
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  pathResolver: (pathParams) => string,

  // Path params — links pathResolver parameter type to the schema
  requestPathParamsSchema: z.ZodType,

  // Request
  requestBodySchema: z.ZodType | ContractNoBody, // POST / PUT / PATCH only
  requestQuerySchema: z.ZodType,
  requestHeaderSchema: z.ZodType,

  // Response
  responseSchemasByStatusCode: { [statusCode]: z.ZodType | ContractNoBody | TypedNonJsonResponse },
  responseHeaderSchema: z.ZodType,
  serverSentEventSchemas: { [eventName]: z.ZodType },

  // Documentation
  summary: string,
  description: string,
  tags: readonly string[],
  metadata: Record<string, unknown>,
})
```

### Header schemas

```ts
const contract = defineRouteContract({
  method: 'get',
  pathResolver: () => '/api/data',
  requestHeaderSchema: z.object({
    authorization: z.string(),
    'x-api-key': z.string(),
  }),
  responseHeaderSchema: z.object({
    'x-ratelimit-remaining': z.string(),
    'cache-control': z.string(),
  }),
  responseSchemasByStatusCode: {
    200: dataSchema,
  },
})
```

### Type utilities

**`InferSuccessResponse<T>`** — TypeScript output type of all 2xx response schemas.

```ts
import type { InferSuccessResponse } from '@lokalise/api-contracts'

type UserResponse = InferSuccessResponse<typeof getUser['responseSchemasByStatusCode']>
// { id: string; name: string }
```

**`InferSuccessSchema<T>`** — union of Zod schema types for all 2xx entries. `ContractNoBody` maps to `undefined`; `TypedNonJsonResponse<S>` maps to its inner schema `S`. Used by HTTP client implementations.

### Utility functions

**`mapRouteContractToPath`** — Express/Fastify-style path pattern.

```ts
import { mapRouteContractToPath } from '@lokalise/api-contracts'

mapRouteContractToPath(getUser) // "/users/:userId"
```

**`describeRouteContract`** — human-readable `"METHOD /path"` string.

```ts
import { describeRouteContract } from '@lokalise/api-contracts'

describeRouteContract(getUser) // "GET /users/:userId"
```

**`getSuccessResponseSchema`** — merged Zod schema from all 2xx entries. Symbol sentinels contribute `z.never()`. Returns `null` when no schema is present.

```ts
import { getSuccessResponseSchema } from '@lokalise/api-contracts'

getSuccessResponseSchema(getUser)    // ZodObject
getSuccessResponseSchema(deleteUser) // null
```

**`getIsEmptyResponseExpected`** — `true` when no Zod schema exists among 2xx entries.

```ts
import { getIsEmptyResponseExpected } from '@lokalise/api-contracts'

getIsEmptyResponseExpected(deleteUser) // true
getIsEmptyResponseExpected(getUser)    // false
```

---

## Deprecated API

> The builders below are **deprecated** and will be removed in a future version. Use `defineRouteContract` instead.

### `buildRestContract` (deprecated)

**`successResponseBodySchema` → `responseSchemasByStatusCode`**

The old API used a single `successResponseBodySchema` field. Map it to the appropriate status code:

```ts
// Before:
buildRestContract({
  method: 'get',
  successResponseBodySchema: userSchema,
  pathResolver: () => '/users',
})

// After:
defineRouteContract({
  method: 'get',
  pathResolver: () => '/users',
  responseSchemasByStatusCode: { 200: userSchema },
})
```

**`isEmptyResponseExpected: true` → `ContractNoBody`**

```ts
// Before:
buildRestContract({
  method: 'delete',
  pathResolver: ({ userId }) => `/users/${userId}`,
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  isEmptyResponseExpected: true,
})

// After:
defineRouteContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: { 204: ContractNoBody },
})
```

**`isNonJSONResponseExpected: true` → `nonJsonResponse`**

```ts
// Before:
buildRestContract({
  method: 'get',
  pathResolver: () => '/export.csv',
  isNonJSONResponseExpected: true,
})

// After:
defineRouteContract({
  method: 'get',
  pathResolver: () => '/export.csv',
  responseSchemasByStatusCode: {
    200: nonJsonResponse({ contentType: 'text/csv', schema: z.string() }),
  },
})
```

### `buildContract` (deprecated)

Universal builder that delegated to `buildRestContract` or `buildSseContract`. Use `defineRouteContract` instead.

### `buildSseContract` (deprecated)

SSE/dual-mode builder. Use `defineRouteContract` with `serverSentEventSchemas` instead.

### `buildGetRoute`, `buildPayloadRoute`, `buildDeleteRoute` (deprecated)

Individual builders superseded first by `buildRestContract`, now by `defineRouteContract`.
