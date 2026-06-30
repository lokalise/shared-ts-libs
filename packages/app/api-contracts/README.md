# api-contracts

API contracts are shared definitions that live in a shared package and are consumed by both the client and the backend.
The contract describes a route — its path, HTTP method, and request/response schemas — and serves as the single source of truth for both sides.

The backend implements the route against the contract.
The client uses the same contract to make type-safe requests without duplicating configuration.
This eliminates assumptions across the boundary and keeps documentation, validation, and types in sync.

## Defining contracts

### REST routes

```ts
import { defineApiContract, noBodyResponse } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

// GET with path params
const getUser = defineApiContract({
  summary: 'Get user',
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    200: z.object({ id: z.string(), name: z.string() }),
  },
})

// POST
const createUser = defineApiContract({
  summary: 'Get user',
  method: 'post',
  pathResolver: () => '/users',
  requestBodySchema: z.object({ name: z.string() }),
  responsesByStatusCode: {
    201: z.object({ id: z.string(), name: z.string() }),
  },
})

// DELETE with no response body
const deleteUser = defineApiContract({
  summary: 'Get user',
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.uuid() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    204: noBodyResponse(),
  },
})
```

### Non-JSON responses

Use `blobResponse` for any non-JSON response — text-based (plain text, CSV, HTML, XML, YAML, etc.) or binary (images, PDFs, etc.). It records the response `content-type` in the contract and hands the consumer a `Blob`, leaving the decode choice to the call site via `.text()`, `.arrayBuffer()`, or `.stream()`:

```ts
import { defineApiContract, blobResponse } from '@lokalise/api-contracts'

const exportCsv = defineApiContract({
  summary: 'Get user',
  method: 'get',
  pathResolver: () => '/export.csv',
  responsesByStatusCode: { 200: blobResponse('text/csv') },
})

const downloadPhoto = defineApiContract({
  summary: 'Get user',
  method: 'get',
  pathResolver: () => '/photo.png',
  responsesByStatusCode: { 200: blobResponse('image/png') },
})
```

### Multiple content types

When a single status code can return more than one media type, map it to a `content` object keyed
by media type. Each value is a *body descriptor*: a bare Zod schema (JSON), `blobBody()` (opaque
binary or text), or `sseBody()` (Server-Sent Events). Add `allowNoBody: true` to also accept an
empty body.

```ts
import { defineApiContract, blobBody, sseBody } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

const downloadReport = defineApiContract({
  summary: 'Get user',
  method: 'get',
  pathResolver: () => '/report',
  responsesByStatusCode: {
    200: {
      description: 'Report in the requested format',
      content: {
        'application/json':         z.object({ rows: z.array(z.string()) }),
        'application/vnd.api+json': z.object({ data: z.object({ rows: z.array(z.string()) }) }),
        'text/csv':                 blobBody(),
        'application/pdf':          blobBody(),
        'text/event-stream':        sseBody({ row: z.object({ value: z.string() }) }),
      },
      allowNoBody: true,
    },
  },
})
```

Media types are matched **exactly** — parameters stripped, case-insensitive — so distinct keys such
as `application/json` and `application/vnd.api+json` never collide, and a single status code may
expose any number of media types (including several JSON variants). The shape maps 1:1 to the
OpenAPI Response Object. The matched media type is **not** surfaced on the client response; read it
from `headers['content-type']` if you need to discriminate.

### SSE and dual-mode routes

Use `sseResponse()` inside `responsesByStatusCode` for an SSE-only response. For a route that
returns either JSON or an SSE stream depending on the `Accept` header, use a content map (above)
with both an `application/json` and a `text/event-stream` entry.

```ts
import { defineApiContract, sseResponse, sseBody } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

// SSE-only
const notifications = defineApiContract({
  summary: 'Get user',
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
  summary: 'Get user',
  method: 'post',
  pathResolver: () => '/chat/completions',
  requestBodySchema: z.object({ message: z.string() }),
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': z.object({ text: z.string() }),
        'text/event-stream': sseBody({
          chunk: z.object({ delta: z.string() }),
          done: z.object({ finish_reason: z.string() }),
        }),
      },
    },
  },
})
```

### Wildcard and default response keys

In addition to exact status codes, `responsesByStatusCode` accepts OpenAPI-style range keys (`'1xx'`–`'5xx'`) and `'default'` as fallbacks.

Lookup precedence at runtime: **exact code → range key → `'default'`**.

```ts
import { defineApiContract } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

// '2xx' covers all 200–299 responses
const listItems = defineApiContract({
  summary: 'Get user',
  method: 'get',
  pathResolver: () => '/items',
  responsesByStatusCode: {
    '2xx': z.object({ items: z.array(z.string()) }),
    '4xx': z.object({ message: z.string() }),
  },
})

// exact code takes precedence over the range key
const createItem = defineApiContract({
  summary: 'Get user',
  method: 'post',
  pathResolver: () => '/items',
  requestBodySchema: z.object({ name: z.string() }),
  responsesByStatusCode: {
    201: z.object({ id: z.string() }),
    '4xx': z.object({ message: z.string() }),
  },
})

// 'default' matches any status code not covered by a more specific entry
const flexible = defineApiContract({
  summary: 'Get user',
  method: 'get',
  pathResolver: () => '/data',
  responsesByStatusCode: {
    200: z.object({ data: z.unknown() }),
    default: z.object({ error: z.string() }),
  },
})
```

The `'2xx'` range key participates in SSE detection and success/error type narrowing exactly like explicit 2xx codes: `InferNonSseClientResponse` maps it to `SuccessfulHttpStatusCode`, and `hasAnySuccessSseResponse` returns `true` when it holds an SSE schema.

`'default'` is split into a success half (`SuccessfulHttpStatusCode`) and a non-success half in `InferSseClientResponse` / `InferNonSseClientResponse` so that `captureAsError` type narrowing stays correct regardless of the actual status code.

### OpenAPI response descriptions

All response factories accept an optional `ResponseOptions` object as their last argument.

```ts
import { defineApiContract, noBodyResponse, blobBody, sseBody } from '@lokalise/api-contracts'
import { z } from 'zod/v4'

const contract = defineApiContract({
  summary: 'Get user',
  method: 'post',
  pathResolver: () => '/files',
  requestBodySchema: z.object({ name: z.string() }),
  responsesByStatusCode: {
    201: z.object({ id: z.string() }).describe('Created resource'),
    204: noBodyResponse({ description: 'Deleted — no content returned' }),
    200: {
      description: 'Multiple response formats available',
      content: {
        'application/json': z.object({ id: z.string() }).describe('JSON representation'),
        'text/csv': blobBody(),
        'application/pdf': blobBody(),
        'text/event-stream': sseBody({ update: z.object({ id: z.string() }) }),
      },
    },
  },
})
```

A content-map entry carries a single `description` for the whole response; per-media descriptions
aren't supported (a JSON descriptor can still carry its own via `.describe()`).

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
type ApiContractOptions = {
  // Required
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  pathResolver: (pathParams: Record<string, string>) => string
  // Human-readable summary; surfaced in fe/be http-client errors for debugging.
  summary: string
  // Accepts exact codes, OpenAPI-style range keys ('1xx'–'5xx'), and a catch-all 'default'.
  // Lookup precedence at runtime: exact code → range key → 'default'.
  responsesByStatusCode: Partial<
    Record<
      HttpStatusCode | '1xx' | '2xx' | '3xx' | '4xx' | '5xx' | 'default',
      z.ZodType | ResponseEntry
    >
  >

  // Path params — links pathResolver parameter type to the schema
  requestPathParamsSchema?: z.ZodObject<z.ZodRawShape>

  // Request
  requestBodySchema?: z.ZodType | ContractNoBody  // required for POST / PUT / PATCH, forbidden otherwise
  requestQuerySchema?: z.ZodObject<z.ZodRawShape>
  requestHeaderSchema?: z.ZodObject<z.ZodRawShape>

  // Response
  responseHeaderSchema?: z.ZodObject<z.ZodRawShape>

  // Documentation
  description?: string
  tags?: readonly string[]
  metadata?: Record<string, unknown>
}
```

### Header schemas

```ts
const contract = defineApiContract({
  summary: 'Get user',
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

**`InferNonSseSuccessResponses<T>`** — TypeScript output type of all non-SSE 2xx responses. JSON schemas → `z.output<T>`, a blob entry → `Blob`, a no-body entry → `undefined`, an SSE entry → `never` (excluded). Content-map entries are unpacked before mapping.

```ts
import type { InferNonSseSuccessResponses } from '@lokalise/api-contracts'

type UserResponse = InferNonSseSuccessResponses<typeof getUser['responsesByStatusCode']>
// { id: string; name: string }

type CsvResponse = InferNonSseSuccessResponses<typeof exportCsv['responsesByStatusCode']>
// Blob
```

**`InferJsonSuccessResponses<T>`** — union of Zod schema types for all JSON 2xx entries. Blob, SSE, and `ContractNoBody` entries are excluded.

**`InferSseSuccessResponses<T>`** — extracts the SSE event schema map type from a `responsesByStatusCode` map. Returns `never` when no SSE schemas are present.

**`HasAnySseSuccessResponse<T>`** — `true` if any 2xx entry (exact code or `'2xx'` range key) is an SSE response (a `sseResponse()` / content-map SSE descriptor).

**`HasAnyJsonSuccessResponse<T>`** — `true` if any 2xx entry is a JSON Zod schema or a content-map JSON descriptor.

**`HasAnyNonSseSuccessResponse<T>`** — `true` if any 2xx entry is a non-SSE response (JSON, blob, or no-body).

**`ContractResponseMode<T>`** — classifies a contract into `'dual'` (SSE + non-SSE), `'sse'` (SSE-only), or `'non-sse'` (JSON/blob/no-body).

**`AvailableResponseModes<T>`** — union of mode literals available for a contract: `'json' | 'sse' | 'blob' | 'noContent'`.

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

**`InferSseClientResponse<TApiContract>`** — discriminated union of `{ statusCode, headers, body }` for SSE mode. Exact 2xx codes and the `'2xx'` range key yield `AsyncIterable<SseEventOf<...>>`; error codes, other range keys, and `'default'` yield the declared body type. `'default'` is split into a `SuccessfulHttpStatusCode` half and a non-success half.

**`InferNonSseClientResponse<TApiContract>`** — same shape as above for non-SSE mode. Exact 2xx codes and the `'2xx'` range key yield JSON / `Blob` / `null` (SSE excluded); error codes, other range keys, and `'default'` yield the declared body type as-is. `'default'` is split the same way.

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

**`hasAnySuccessSseResponse`** — `true` when any 2xx entry (exact code or `'2xx'` range key) is an SSE response (including inside a content map).

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
  summary: 'Get user',
  method: 'post',
  pathResolver: () => '/upload',
  requestBodySchema: z.object({ file: z.unknown() }),
  requestBodyContentType: 'multipart/form-data',
  responsesByStatusCode: { 200: z.object({ url: z.string() }) },
})
```
