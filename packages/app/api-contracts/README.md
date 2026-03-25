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

### Non-JSON responses

Use `textResponse` for plain-text or CSV responses, and `blobResponse` for binary responses (images, PDFs, etc.). Both carry the content type.

```ts
import { defineRouteContract, textResponse, blobResponse } from '@lokalise/api-contracts'

const exportCsv = defineRouteContract({
  method: 'get',
  pathResolver: () => '/export.csv',
  responseSchemasByStatusCode: {
    200: textResponse('text/csv'),
  },
})

const downloadPhoto = defineRouteContract({
  method: 'get',
  pathResolver: () => '/photo.png',
  responseSchemasByStatusCode: {
    200: blobResponse('image/png'),
  },
})
```

### SSE and dual-mode routes

Use `sseResponse()` inside `responseSchemasByStatusCode` to define SSE event schemas. For endpoints that can respond with either JSON or an SSE stream depending on the `Accept` header, use `anyOfResponses()` to declare both options on the same status code.

```ts
import { defineRouteContract, sseResponse, anyOfResponses } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

// SSE-only
const notifications = defineRouteContract({
  method: 'get',
  pathResolver: () => '/notifications/stream',
  responseSchemasByStatusCode: {
    200: sseResponse({
      notification: z.object({ id: z.string(), message: z.string() }),
    }),
  },
})

// Dual-mode: JSON response or SSE stream depending on Accept header
const chatCompletion = defineRouteContract({
  method: 'post',
  pathResolver: () => '/chat/completions',
  requestBodySchema: z.object({ message: z.string() }),
  responseSchemasByStatusCode: {
    200: anyOfResponses([
      sseResponse({
        chunk: z.object({ delta: z.string() }),
        done: z.object({ finish_reason: z.string() }),
      }),
      z.object({ text: z.string() }),
    ]),
  },
})
```

`getSseSchemaByEventName(contract)` extracts SSE event schemas from a contract:

```ts
import { getSseSchemaByEventName } from '@lokalise/api-contracts'

getSseSchemaByEventName(notifications)
// { notification: ZodObject<...> }

getSseSchemaByEventName(chatCompletion)
// { chunk: ZodObject<...>, done: ZodObject<...> }
```

### All fields

```ts
defineRouteContract({
  // Required
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  pathResolver: (pathParams) => string,
  responseSchemasByStatusCode: {
    [statusCode]: z.ZodType | ContractNoBody | TypedTextResponse | TypedBlobResponse | TypedSseResponse | AnyOfResponses
  },

  // Path params — links pathResolver parameter type to the schema
  requestPathParamsSchema: z.ZodType,

  // Request
  requestBodySchema: z.ZodType | ContractNoBody, // POST / PUT / PATCH only
  requestQuerySchema: z.ZodType,
  requestHeaderSchema: z.ZodType,

  // Response
  responseHeaderSchema: z.ZodType,

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

**`InferNonSseSuccessResponses<T>`** — TypeScript output type of all non-SSE 2xx responses. JSON schemas → `z.output<T>`, `textResponse` → `string`, `blobResponse` → `Blob`, `ContractNoBody` → `undefined`, `sseResponse` → `never` (excluded). `anyOfResponses` entries are unpacked before mapping.

```ts
import type { InferNonSseSuccessResponses } from '@lokalise/api-contracts'

type UserResponse = InferNonSseSuccessResponses<typeof getUser['responseSchemasByStatusCode']>
// { id: string; name: string }

type CsvResponse = InferNonSseSuccessResponses<typeof exportCsv['responseSchemasByStatusCode']>
// string
```

**`InferJsonSuccessResponses<T>`** — union of Zod schema types for all JSON 2xx entries. Text, Blob, SSE, and `ContractNoBody` entries are excluded.

**`InferSseSuccessResponses<T>`** — extracts the SSE event schema map type from a `responseSchemasByStatusCode` map. Returns `never` when no SSE schemas are present.

**`HasAnySseSuccessResponse<T>`** — `true` if any 2xx entry is a `TypedSseResponse` or an `AnyOfResponses` containing one.

**`HasAnyJsonSuccessResponse<T>`** — `true` if any 2xx entry is a JSON Zod schema or an `AnyOfResponses` containing one.

**`IsNoBodySuccessResponse<T>`** — `true` when all 2xx entries are `ContractNoBody` or no 2xx status codes are defined.

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

**`getSuccessResponseSchema`** — merged Zod schema from all 2xx JSON entries. `ContractNoBody` and non-JSON entries are excluded. Returns `null` when no schema is present.

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

**`getSseSchemaByEventName`** — extracts SSE event schemas from a contract. Returns `null` when no SSE schemas are present.

```ts
import { getSseSchemaByEventName } from '@lokalise/api-contracts'

getSseSchemaByEventName(notifications) // { notification: ZodObject<...> }
getSseSchemaByEventName(getUser)       // null
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

**`isNonJSONResponseExpected: true` → `textResponse` / `blobResponse`**

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
    200: textResponse('text/csv'),
  },
})
```

### `buildContract` (deprecated)

Universal builder that delegated to `buildRestContract` or `buildSseContract`. Use `defineRouteContract` instead.

### `buildSseContract` (deprecated)

SSE/dual-mode builder. Use `defineRouteContract` with `sseResponse()` or `anyOfResponses()` inside `responseSchemasByStatusCode` instead.

### `buildGetRoute`, `buildPayloadRoute`, `buildDeleteRoute` (deprecated)

Individual builders superseded first by `buildRestContract`, now by `defineRouteContract`.
