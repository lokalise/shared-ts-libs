# api-contracts

Key idea behind API contracts: backend owns entire definition for the route, including its path, HTTP method used and
response structure expectations, and exposes it as a part of its API schemas. Then frontend consumes that definition
instead of forming full request configuration manually on the client side.

This reduces amount of assumptions FE needs to make about the behaviour of BE, reduces amount of code that needs to be
written on FE, and makes the code more type-safe (as path parameter setting is handled by logic exposed by BE, in a
type-safe way).

Usage examples:

```ts
import { buildGetRoute, buildDeleteRoute, buildPayloadRoute } from '@lokalise/api-contracts'

const getContract = buildGetRoute({
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    requestQuerySchema: REQUEST_QUERY_SCHEMA,
    requestHeaderSchema: REQUEST_HEADER_SCHEMA,
    responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    summary: 'Route summary',
    metadata: { allowedRoles: ['admin'] },
})

const postContract = buildPayloadRoute({
    method: 'post', // can also be 'patch' or 'post'
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestBodySchema: REQUEST_BODY_SCHEMA,
    pathResolver: () => '/',
    summary: 'Route summary',
    metadata: { allowedPermission: ['edit'] },
})

const deleteContract = buildDeleteRoute({
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})
```

In the previous example, the `metadata` property is an optional, free-form field that allows you to store any additional
information related to the route. If you require more precise type definitions for the `metadata` field, you can utilize
TypeScript's module augmentation mechanism to enforce stricter typing. This allows for more controlled and type-safe
usage in your route definitions.

Here is how you can apply strict typing to the `metadata` property using TypeScript module augmentation:
```typescript 
// file -> apiContracts.d.ts
// Import the existing module to ensure TypeScript recognizes the original definitions
import '@lokalise/api-contracts';

// Augment the module to extend the interface with specific properties
declare module '@lokalise/api-contracts' {
    interface CommonRouteDefinitionMetadata {
        myTestProp?: string[];
        mySecondTestProp?: number;
    }
}
```

Note that in order to make contract-based requests, you need to use a compatible HTTP client
(`@lokalise/frontend-http-client` or `@lokalise/backend-http-client`)

In case you are using fastify on the backend, you can also use `@lokalise/fastify-api-contracts` in order to simplify definition of your fastify routes, utilizing contracts as the single source of truth.

## Header Schemas

### Request Headers (`requestHeaderSchema`)

Use `requestHeaderSchema` to define and validate headers that the client must send with the request. This is useful for authentication headers, API keys, content negotiation, and other request-specific headers.

```ts
import { buildGetRoute } from '@lokalise/api-contracts'
import { z } from 'zod'

const contract = buildGetRoute({
    successResponseBodySchema: DATA_SCHEMA,
    requestHeaderSchema: z.object({
        'authorization': z.string(),
        'x-api-key': z.string(),
        'accept-language': z.string().optional(),
    }),
    pathResolver: () => '/api/data',
})
```

### Response Headers (`responseHeaderSchema`)

Use `responseHeaderSchema` to define and validate headers that the server will send in the response. This is particularly useful for documenting:
- Rate limiting headers
- Pagination headers
- Cache control headers
- Custom API metadata headers

```ts
import { buildGetRoute } from '@lokalise/api-contracts'
import { z } from 'zod'

const contract = buildGetRoute({
    successResponseBodySchema: DATA_SCHEMA,
    responseHeaderSchema: z.object({
        'x-ratelimit-limit': z.string(),
        'x-ratelimit-remaining': z.string(),
        'x-ratelimit-reset': z.string(),
        'cache-control': z.string(),
    }),
    pathResolver: () => '/api/data',
})
```

Both header schemas can be used together in a single contract:

```ts
const contract = buildGetRoute({
    successResponseBodySchema: DATA_SCHEMA,
    requestHeaderSchema: z.object({
        'authorization': z.string(),
    }),
    responseHeaderSchema: z.object({
        'x-ratelimit-limit': z.string(),
        'x-ratelimit-remaining': z.string(),
    }),
    pathResolver: () => '/api/data',
})
```

These header schemas are primarily used for:
- OpenAPI/Swagger documentation generation
- Client-side validation of response headers
- Type-safe header access in TypeScript
- Contract testing between frontend and backend

## Utility Functions

### `mapRouteToPath`

Converts a route definition to its corresponding path pattern with parameter placeholders.

```ts
import { mapRouteToPath, buildGetRoute } from '@lokalise/api-contracts'

const userContract = buildGetRoute({
    requestPathParamsSchema: z.object({ userId: z.string() }),
    successResponseBodySchema: USER_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const pathPattern = mapRouteToPath(userContract)
// Returns: "/users/:userId"
```

This function is useful when you need to:
- Generate OpenAPI/Swagger documentation
- Create route patterns for server-side routing frameworks
- Display route information in debugging or logging

The function replaces actual path parameters with placeholder syntax (`:paramName`), making it compatible with Express-style route patterns.

### `describeContract`

Generates a human-readable description of a route contract, combining the HTTP method with the route path.

```ts
import { describeContract, buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'

const getContract = buildGetRoute({
    requestPathParamsSchema: z.object({ userId: z.string() }),
    successResponseBodySchema: USER_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const postContract = buildPayloadRoute({
    method: 'post',
    requestPathParamsSchema: z.object({ 
        orgId: z.string(),
        userId: z.string() 
    }),
    requestBodySchema: CREATE_USER_SCHEMA,
    successResponseBodySchema: USER_SCHEMA,
    pathResolver: (pathParams) => `/orgs/${pathParams.orgId}/users/${pathParams.userId}`,
})

console.log(describeContract(getContract))  // "GET /users/:userId"
console.log(describeContract(postContract)) // "POST /orgs/:orgId/users/:userId"
```

This function is particularly useful for:
- Logging and debugging API calls
- Generating documentation or route summaries
- Error messages that need to reference specific endpoints
- Test descriptions and assertions

## SSE and Dual-Mode Contracts

Use `buildSseContract` for endpoints that support Server-Sent Events (SSE) streaming. This builder supports two contract types:

### SSE-Only Contracts

Pure streaming endpoints that only return SSE events. Use these for real-time notifications, live feeds, or any endpoint that only streams data.

```ts
import { buildSseContract } from '@lokalise/api-contracts'
import { z } from 'zod'

// GET SSE endpoint for live notifications
const notificationsStream = buildSseContract({
    pathResolver: () => '/api/notifications/stream',
    params: z.object({}),
    query: z.object({ userId: z.string().optional() }),
    requestHeaders: z.object({}),
    sseEvents: {
        notification: z.object({ id: z.string(), message: z.string() }),
    },
})
// Result: isSSE: true

// POST SSE endpoint (e.g., streaming file processing)
const processStream = buildSseContract({
    method: 'post',
    pathResolver: () => '/api/process/stream',
    params: z.object({}),
    query: z.object({}),
    requestHeaders: z.object({}),
    requestBody: z.object({ fileId: z.string() }),
    sseEvents: {
        progress: z.object({ percent: z.number() }),
        done: z.object({ result: z.string() }),
    },
})
// Result: isSSE: true

// SSE endpoint with error schemas (for errors before streaming starts)
const channelStream = buildSseContract({
    pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
    params: z.object({ channelId: z.string() }),
    query: z.object({}),
    requestHeaders: z.object({ authorization: z.string() }),
    sseEvents: {
        message: z.object({ text: z.string() }),
    },
    // Errors returned before streaming begins
    responseSchemasByStatusCode: {
        401: z.object({ error: z.literal('Unauthorized') }),
        404: z.object({ error: z.literal('Channel not found') }),
    },
})
```

### Dual-Mode (Hybrid) Contracts

Hybrid endpoints that support **both** synchronous JSON responses **and** SSE streaming from the same URL. The response mode is determined by the client's `Accept` header:
- `Accept: application/json` → Synchronous JSON response
- `Accept: text/event-stream` → SSE streaming

This pattern is ideal for AI/LLM APIs (like OpenAI's Chat Completions API) where clients can choose between getting the full response at once or streaming it token-by-token.

```ts
import { buildSseContract } from '@lokalise/api-contracts'
import { z } from 'zod'

// OpenAI-style chat completion endpoint
// - Accept: application/json → returns { reply, usage } immediately
// - Accept: text/event-stream → streams chunk events, then done event
const chatCompletion = buildSseContract({
    method: 'post',
    pathResolver: () => '/api/chat/completions',
    params: z.object({}),
    query: z.object({}),
    requestHeaders: z.object({}),
    requestBody: z.object({ message: z.string() }),
    // Adding syncResponseBody makes it dual-mode
    syncResponseBody: z.object({
        reply: z.string(),
        usage: z.object({ tokens: z.number() }),
    }),
    sseEvents: {
        chunk: z.object({ delta: z.string() }),
        done: z.object({ usage: z.object({ totalTokens: z.number() }) }),
    },
})
// Result: isDualMode: true

// GET dual-mode endpoint for job status (poll or stream)
const jobStatus = buildSseContract({
    pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
    params: z.object({ jobId: z.string().uuid() }),
    query: z.object({ verbose: z.string().optional() }),
    requestHeaders: z.object({}),
    syncResponseBody: z.object({
        status: z.enum(['pending', 'running', 'completed', 'failed']),
        progress: z.number(),
    }),
    sseEvents: {
        progress: z.object({ percent: z.number() }),
        done: z.object({ result: z.string() }),
    },
})
// Result: isDualMode: true
```

### Response Schemas by Status Code

Both SSE-only and dual-mode contracts support `responseSchemasByStatusCode` for defining different response shapes for errors that occur **before streaming starts** (e.g., authentication failures, validation errors, resource not found):

```ts
const chatCompletion = buildSseContract({
    method: 'post',
    pathResolver: () => '/api/chat/completions',
    params: z.object({}),
    query: z.object({}),
    requestHeaders: z.object({ authorization: z.string() }),
    requestBody: z.object({ message: z.string() }),
    syncResponseBody: z.object({ reply: z.string() }),
    sseEvents: {
        chunk: z.object({ delta: z.string() }),
    },
    responseSchemasByStatusCode: {
        400: z.object({ error: z.string(), details: z.array(z.string()) }),
        401: z.object({ error: z.literal('Unauthorized') }),
        429: z.object({ error: z.string(), retryAfter: z.number() }),
    },
})
```

### Contract Type Detection

`buildSseContract` automatically determines the contract type based on the presence of `syncResponseBody`:

| `syncResponseBody` | `requestBody` | Result |
|-------------------|---------------|--------|
| ❌ | ❌ | SSE-only GET |
| ❌ | ✅ | SSE-only POST/PUT/PATCH |
| ✅ | ❌ | Dual-mode GET |
| ✅ | ✅ | Dual-mode POST/PUT/PATCH |
