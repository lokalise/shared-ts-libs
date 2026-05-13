# api-contracts

API contracts are shared definitions that live in a shared package and are consumed by both the client and the backend.
The contract describes a route — its path, HTTP method, and request/response schemas — and serves as the single source of truth for both sides.

The backend implements the route against the contract.
The client uses the same contract to make type-safe requests without duplicating configuration.
This eliminates assumptions across the boundary and keeps documentation, validation, and types in sync.

## Defining contracts

### REST routes

```ts
import { defineApiContract, ContractNoBody } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

// GET with path params
const getUser = defineApiContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    200: z.object({ id: z.string(), name: z.string() }),
  },
})

// POST
const createUser = defineApiContract({
  method: 'post',
  pathResolver: () => '/users',
  requestBodySchema: z.object({ name: z.string() }),
  responsesByStatusCode: {
    201: z.object({ id: z.string(), name: z.string() }),
  },
})

// DELETE with no response body
const deleteUser = defineApiContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    204: ContractNoBody,
  },
})
```

### Non-JSON responses

Use `textResponse` for text-based responses (plain text, CSV, HTML, XML, YAML, etc.):

```ts
import { defineApiContract, textResponse } from '@lokalise/api-contracts'

const exportCsv = defineApiContract({
  method: 'get',
  pathResolver: () => '/export.csv',
  responsesByStatusCode: { 200: textResponse('text/csv') },
})

const getPage = defineApiContract({
  method: 'get',
  pathResolver: () => '/page',
  responsesByStatusCode: { 200: textResponse('text/html') },
})

const getDocument = defineApiContract({
  method: 'get',
  pathResolver: () => '/document',
  responsesByStatusCode: { 200: textResponse('application/xml') },
})
```

Use `blobResponse` for binary responses (images, PDFs, etc.):

```ts
import { defineApiContract, blobResponse } from '@lokalise/api-contracts'

const downloadPhoto = defineApiContract({
  method: 'get',
  pathResolver: () => '/photo.png',
  responsesByStatusCode: { 200: blobResponse('image/png') },
})
```

### SSE and dual-mode routes

Use `sseResponse()` inside `responsesByStatusCode` to define SSE event schemas.
For endpoints that can respond with either JSON or an SSE stream depending on the `Accept` header, use `anyOfResponses()` to declare both options on the same status code.

```ts
import { defineApiContract, sseResponse, anyOfResponses } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

// SSE-only
const notifications = defineApiContract({
  method: 'get',
  pathResolver: () => '/notifications/stream',
  responsesByStatusCode: {
    200: sseResponse({
      notification: z.object({ id: z.string(), message: z.string() }),
    }),
  },
})

// Dual-mode: JSON response or SSE stream depending on Accept header
const chatCompletion = defineApiContract({
  method: 'post',
  pathResolver: () => '/chat/completions',
  requestBodySchema: z.object({ message: z.string() }),
  responsesByStatusCode: {
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
defineApiContract({
  // Required
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  pathResolver: (pathParams) => string,
  responsesByStatusCode: {
    [statusCode]: z.ZodType | ContractNoBody | TypedTextResponse | TypedBlobResponse | TypedSseResponse | AnyOfResponses
  },

  // Path params — links pathResolver parameter type to the schema
  requestPathParamsSchema: z.ZodObject,

  // Request
  requestBodySchema: z.ZodType | ContractNoBody, // required for POST / PUT / PATCH, forbidden otherwise
  requestQuerySchema: z.ZodObject,
  requestHeaderSchema: z.ZodObject,

  // Response
  responseHeaderSchema: z.ZodObject,

  // Documentation
  summary: string,
  description: string,
  tags: readonly string[],
  metadata: Record<string, unknown>,
})
```

### Header schemas

```ts
const contract = defineApiContract({
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
  responsesByStatusCode: {
    200: dataSchema,
  },
})
```

### Type utilities

**`InferNonSseSuccessResponses<T>`** — TypeScript output type of all non-SSE 2xx responses. JSON schemas → `z.output<T>`, `textResponse` → `string`, `blobResponse` → `Blob`, `ContractNoBody` → `undefined`, `sseResponse` → `never` (excluded). `anyOfResponses` entries are unpacked before mapping.

```ts
import type { InferNonSseSuccessResponses } from '@lokalise/api-contracts'

type UserResponse = InferNonSseSuccessResponses<typeof getUser['responsesByStatusCode']>
// { id: string; name: string }

type CsvResponse = InferNonSseSuccessResponses<typeof exportCsv['responsesByStatusCode']>
// string
```

**`InferJsonSuccessResponses<T>`** — union of Zod schema types for all JSON 2xx entries. Text, Blob, SSE, and `ContractNoBody` entries are excluded.

**`InferSseSuccessResponses<T>`** — extracts the SSE event schema map type from a `responsesByStatusCode` map. Returns `never` when no SSE schemas are present.

**`HasAnySseSuccessResponse<T>`** — `true` if any 2xx entry is a `TypedSseResponse` or an `AnyOfResponses` containing one.

**`HasAnyJsonSuccessResponse<T>`** — `true` if any 2xx entry is a JSON Zod schema or an `AnyOfResponses` containing one.

**`HasAnyNonSseSuccessResponse<T>`** — `true` if any 2xx entry is a non-SSE response (JSON, text, blob, or no-body).

**`IsNoBodySuccessResponse<T>`** — `true` when all 2xx entries are `ContractNoBody` or no 2xx status codes are defined.

**`ContractResponseMode<T>`** — classifies a contract into `'dual'` (SSE + non-SSE), `'sse'` (SSE-only), or `'non-sse'` (JSON/text/blob/no-body).

**`AvailableResponseModes<T>`** — union of mode literals available for a contract: `'json' | 'sse' | 'blob' | 'text' | 'noContent'`.

**`SseEventOf<S>`** — discriminated union of SSE events inferred from a `schemaByEventName` map. Aligns with the browser `MessageEvent` shape: `{ type, data, lastEventId, retry }`.

```ts
import type { SseEventOf, InferSseSuccessResponses } from '@lokalise/api-contracts'

type NotificationEvents = InferSseSuccessResponses<typeof notifications['responsesByStatusCode']>
type NotificationEvent = SseEventOf<NotificationEvents>
// { type: 'notification'; data: { id: string; message: string }; lastEventId: string; retry: number | undefined }
```

### Client types

These types are primarily consumed by HTTP client implementations.

**`ClientRequestParams<TApiContract, TIsStreaming>`** — infers the request parameter object for a contract. Includes `pathParams`, `body`, `queryParams`, `headers` (required when the corresponding schema is defined), `pathPrefix` (always optional), and `streaming` (required for dual-mode contracts, forbidden otherwise).

**`InferSseClientResponse<TApiContract>`** — discriminated union of `{ statusCode, headers, body }` for SSE mode. Success status codes yield `AsyncIterable<SseEventOf<...>>`; error codes yield the declared body type.

**`InferNonSseClientResponse<TApiContract>`** — same shape as above for non-SSE mode. Success status codes yield JSON / `string` / `Blob` / `null`; SSE entries are excluded (`never`).

**`DefaultStreaming<T>`** — `true` for SSE-only contracts, `false` for everything else.

```ts
import type { ClientRequestParams, InferNonSseClientResponse } from '@lokalise/api-contracts'

type GetUserParams = ClientRequestParams<typeof getUser, false>
// { pathParams: { userId: string }; pathPrefix?: string }

type GetUserResponse = InferNonSseClientResponse<typeof getUser>
// { statusCode: 200; headers: Record<string, string>; body: { id: string; name: string } }
```

### Contract type aliases

**`ApiContract`** — union of all contract variants (`GetApiContract | DeleteApiContract | PayloadApiContract`). Use this to type function parameters that accept any contract.

**`GetApiContract`**, **`DeleteApiContract`**, **`PayloadApiContract`** — individual contract variants if you need to narrow the type.

**`RequestPathParamsSchema`**, **`RequestQuerySchema`**, **`RequestHeaderSchema`**, **`ResponseHeaderSchema`** — type aliases for `z.ZodObject`. Use these to constrain schema arguments in generic helpers.

### Utility functions

**`mapApiContractToPath`** — Express/Fastify-style path pattern.

```ts
import { mapApiContractToPath } from '@lokalise/api-contracts'

mapApiContractToPath(getUser) // "/users/:userId"
```

**`describeApiContract`** — human-readable `"METHOD /path"` string.

```ts
import { describeApiContract } from '@lokalise/api-contracts'

describeApiContract(getUser) // "GET /users/:userId"
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

**`hasAnySuccessSseResponse`** — `true` when any 2xx entry is an SSE response (including inside `anyOfResponses`).

```ts
import { hasAnySuccessSseResponse } from '@lokalise/api-contracts'

hasAnySuccessSseResponse(notifications)   // true
hasAnySuccessSseResponse(getUser)         // false
hasAnySuccessSseResponse(chatCompletion)  // true (dual-mode)
```

**`getSseSchemaByEventName`** — extracts SSE event schemas from a contract. Returns `null` when no SSE schemas are present.

```ts
import { getSseSchemaByEventName } from '@lokalise/api-contracts'

getSseSchemaByEventName(notifications) // { notification: ZodObject<...> }
getSseSchemaByEventName(getUser)       // null
```

## Module augmentation

If you require more precise type definitions for the `metadata` field, you can utilize TypeScript's module augmentation mechanism to enforce stricter typing:

```typescript
// file -> apiContracts.d.ts
import '@lokalise/api-contracts';

declare module '@lokalise/api-contracts' {
  interface CommonRouteDefinitionMetadata {
    myTestProp?: string[];
    mySecondTestProp?: number;
  }
}
```

## HTTP clients

To make contract-based requests, use a compatible HTTP client (`@lokalise/frontend-http-client` or `@lokalise/backend-http-client`).

For Fastify backends, use `@lokalise/fastify-api-contracts` to simplify route definition using contracts as the single source of truth.

## Future: request body content type

Currently, HTTP clients default to `application/json` when a request body is present. The planned improvement is a `requestBodyContentType` field on `defineApiContract`:

```ts
defineApiContract({
  method: 'post',
  pathResolver: () => '/upload',
  requestBodySchema: z.object({ file: z.unknown() }),
  requestBodyContentType: 'multipart/form-data',
  responsesByStatusCode: { 200: z.object({ url: z.string() }) },
})
```
