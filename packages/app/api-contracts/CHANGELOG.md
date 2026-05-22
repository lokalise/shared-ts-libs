# Changelog

## 6.12.0

### Minor Changes

- 81c79bf: Add optional `description` field to all response factories for OpenAPI spec support. New `noBodyResponse()` factory and `isNoBodyResponse()` type guard replace `ContractNoBody` in `responsesByStatusCode`. Shared `ResponseOptions` type accepted by `textResponse`, `blobResponse`, `sseResponse`, `anyOfResponses`, and `noBodyResponse`.

## [6.10.0] - 2026-05-08

### Deprecations

All previous contract builder functions are deprecated in favor of `defineApiContract`. They remain functional but will be removed in a future major version.

| Deprecated function | Replacement            |
| ------------------- | ---------------------- |
| `buildGetRoute`     | `defineApiContract`    |
| `buildPayloadRoute` | `defineApiContract`    |
| `buildDeleteRoute`  | `defineApiContract`    |
| `buildRestContract` | `defineApiContract`    |
| `buildContract`     | `defineApiContract`    |
| `buildSseContract`  | `defineApiContract`    |
| `mapRouteToPath`    | `mapApiContractToPath` |
| `describeContract`  | `describeApiContract`  |

### New API: `defineApiContract`

`defineApiContract` is the single entry point for defining any contract type — REST, SSE-only, or dual-mode. It replaces all previous builders with a unified API centred on `responsesByStatusCode`.

| Old API                                                           | New API                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `successResponseBodySchema`                                       | `responsesByStatusCode: { 200: schema }`                                                   |
| `serverSentEventSchemas`                                          | `responsesByStatusCode: { 200: sseResponse(schemas) }`                                     |
| `successResponseBodySchema` + `serverSentEventSchemas`            | `responsesByStatusCode: { 200: anyOfResponses([sseResponse(...), jsonSchema]) }`           |
| `isEmptyResponseExpected: true`                                   | `responsesByStatusCode: { 204: ContractNoBody }`                                           |
| `isNonJSONResponseExpected: true`                                 | `responsesByStatusCode: { 200: textResponse(contentType) }` or `blobResponse(contentType)` |
| `responseSchemasByStatusCode` / `responseBodySchemasByStatusCode` | Same `responsesByStatusCode` map, alongside success entries                                |

Fields that carry over unchanged: `method`, `pathResolver`, `requestPathParamsSchema`, `requestQuerySchema`, `requestBodySchema`, `requestHeaderSchema`, `responseHeaderSchema`, `summary`, `description`, `tags`, `metadata`.

---

## Migration guide

This entire section can be pasted into an AI assistant as a migration prompt.

You are migrating TypeScript API contracts in a codebase that uses `@lokalise/api-contracts`.
The old API used individual builder functions (`buildGetRoute`, `buildPayloadRoute`, `buildDeleteRoute`, `buildRestContract`, `buildContract`, `buildSseContract`).
The new API replaces all of them with a single `defineApiContract` function.
Apply the rules below to every file provided.

### Rule 1 — GET route

`successResponseBodySchema` moves into `responsesByStatusCode`. Use semantically correct status codes: `200` for data, `201` for created resources, `204: ContractNoBody` for no-body responses.

```ts
// Before
buildGetRoute({
  requestPathParamsSchema: z.object({ userId: z.string() }),
  successResponseBodySchema: z.object({ id: z.string(), name: z.string() }),
  pathResolver: (params) => `/users/${params.userId}`,
});

// After
defineApiContract({
  method: "get",
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    200: z.object({ id: z.string(), name: z.string() }),
  },
});
```

### Rule 2 — POST / PUT / PATCH route

```ts
// Before
buildPayloadRoute({
  method: "post",
  requestBodySchema: z.object({ name: z.string() }),
  successResponseBodySchema: z.object({ id: z.string(), name: z.string() }),
  pathResolver: () => "/users",
});

// After
defineApiContract({
  method: "post",
  requestBodySchema: z.object({ name: z.string() }),
  pathResolver: () => "/users",
  responsesByStatusCode: {
    201: z.object({ id: z.string(), name: z.string() }),
  },
});
```

### Rule 3 — DELETE route

```ts
// Before
buildDeleteRoute({
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: (params) => `/users/${params.userId}`,
});

// After
defineApiContract({
  method: "delete",
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    204: ContractNoBody,
  },
});
```

### Rule 4 — SSE-only route

`serverSentEventSchemas` moves into `responsesByStatusCode` via `sseResponse()`.

```ts
// Before
buildSseContract({
  method: "get",
  pathResolver: () => "/notifications/stream",
  serverSentEventSchemas: {
    notification: z.object({ id: z.string(), message: z.string() }),
  },
});

// After
defineApiContract({
  method: "get",
  pathResolver: () => "/notifications/stream",
  responsesByStatusCode: {
    200: sseResponse({
      notification: z.object({ id: z.string(), message: z.string() }),
    }),
  },
});
```

### Rule 5 — Dual-mode route (JSON or SSE based on `Accept` header)

`successResponseBodySchema` + `serverSentEventSchemas` becomes `anyOfResponses([sseResponse(...), jsonSchema])`.

```ts
// Before
buildSseContract({
  method: "post",
  pathResolver: () => "/chat/completions",
  requestBodySchema: z.object({ message: z.string() }),
  successResponseBodySchema: z.object({ reply: z.string() }),
  serverSentEventSchemas: {
    chunk: z.object({ delta: z.string() }),
    done: z.object({ finish_reason: z.string() }),
  },
});

// After
defineApiContract({
  method: "post",
  pathResolver: () => "/chat/completions",
  requestBodySchema: z.object({ message: z.string() }),
  responsesByStatusCode: {
    200: anyOfResponses([
      sseResponse({
        chunk: z.object({ delta: z.string() }),
        done: z.object({ finish_reason: z.string() }),
      }),
      z.object({ reply: z.string() }),
    ]),
  },
});
```

### Rule 6 — `isNonJSONResponseExpected: true` → `textResponse()` or `blobResponse()`

Use `textResponse(contentType)` for text-based formats (CSV, HTML, XML, plain text, YAML). Use `blobResponse(contentType)` for binary formats (images, PDFs, ZIP).

```ts
// Before
buildRestContract({
  method: "get",
  isNonJSONResponseExpected: true,
  pathResolver: () => "/export.csv",
});

// After
defineApiContract({
  method: "get",
  pathResolver: () => "/export.csv",
  responsesByStatusCode: {
    200: textResponse("text/csv"), // substitute the actual content type
  },
});
```

### Rule 7 — `isEmptyResponseExpected: true` → `ContractNoBody`

```ts
// Before
buildRestContract({
  method: "get",
  isEmptyResponseExpected: true,
  pathResolver: () => "/ping",
});

// After
defineApiContract({
  method: "get",
  pathResolver: () => "/ping",
  responsesByStatusCode: { 204: ContractNoBody },
});
```

### Rule 8 — Error schemas merge into `responsesByStatusCode`

The separate `responseSchemasByStatusCode` (REST) and `responseBodySchemasByStatusCode` (SSE) fields are gone. All status codes — success and error — go into the single `responsesByStatusCode` map.

```ts
// Before
buildSseContract({
  method: "get",
  pathResolver: ({ channelId }) => `/channels/${channelId}/stream`,
  requestPathParamsSchema: z.object({ channelId: z.string() }),
  serverSentEventSchemas: { message: z.object({ text: z.string() }) },
  responseBodySchemasByStatusCode: {
    401: z.object({ error: z.literal("Unauthorized") }),
    404: z.object({ error: z.string() }),
  },
});

// After
defineApiContract({
  method: "get",
  pathResolver: ({ channelId }) => `/channels/${channelId}/stream`,
  requestPathParamsSchema: z.object({ channelId: z.string() }),
  responsesByStatusCode: {
    200: sseResponse({ message: z.object({ text: z.string() }) }),
    401: z.object({ error: z.literal("Unauthorized") }),
    404: z.object({ error: z.string() }),
  },
});
```

### Rule 9 — Utility functions

```ts
// Before
mapRouteToPath(contract); // "/users/:userId"
describeContract(contract); // "GET /users/:userId"

// After
mapApiContractToPath(contract); // "/users/:userId"
describeApiContract(contract); // "GET /users/:userId"
```

### Rule 10 — Import changes

```ts
// Remove
import {
  buildGetRoute,
  buildPayloadRoute,
  buildDeleteRoute,
  buildRestContract,
  buildContract,
  buildSseContract,
  mapRouteToPath,
  describeContract,
} from "@lokalise/api-contracts";

// Add (only what you use)
import {
  defineApiContract,
  ContractNoBody,
  textResponse,
  blobResponse,
  sseResponse,
  anyOfResponses,
  mapApiContractToPath,
  describeApiContract,
} from "@lokalise/api-contracts";
```
