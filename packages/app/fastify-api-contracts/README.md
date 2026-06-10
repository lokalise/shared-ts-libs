# API contract support for fastify

This package adds support for generating fastify routes using universal API contracts, created with `@lokalise/api-contracts`.

## Table of Contents

- [Requirements](#requirements)
- [Builders](#builders)
  - [`buildFastifyApiRoute`](#buildfastifyapiroute)
  - [`buildFastifyRoute`](#buildfastifyroute)
  - [`buildFastifyRouteHandler`](#buildfastifyroutehandler)
  - [Accessing the contract](#accessing-the-contract)
  - [Adding extra route options from contract metadata](#adding-extra-route-options-from-contract-metadata)
- [Test helpers](#test-helpers)
  - [`injectByApiContract`](#injectbyapicontract)
  - [`injectByContract`](#injectbycontract)
- [Deprecated APIs](#deprecated-apis)

## Requirements

This module requires the `fastify-type-provider-zod` type provider to work and is ESM-only.

SSE-capable routes (see [`buildFastifyApiRoute`](#buildfastifyapiroute)) additionally require the [`@fastify/sse`](https://github.com/fastify/fastify-sse) plugin to be registered on the Fastify instance. It is a peer dependency and only needs to be installed when you use contracts that declare an SSE response. Plain JSON routes do not need it.

```ts
import fastifySSE from '@fastify/sse'

await app.register(fastifySSE)
```

Register the Zod compilers on your Fastify instance and use the `ZodTypeProvider` when adding routes:

```ts
import {
    type ZodTypeProvider,
    serializerCompiler,
    validatorCompiler,
} from 'fastify-type-provider-zod'

const app = fastify({
    // app params
})

app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

app.withTypeProvider<ZodTypeProvider>().route(route)
```

## Builders

Builders turn a universal API contract into a Fastify route (or just a route handler). They are meant for production code: you define the contract once with `@lokalise/api-contracts` and let the builders infer request/response types for you.

Pick the builder that matches how the contract was created:

- [`buildFastifyApiRoute`](#buildfastifyapiroute) — for contracts created with `defineApiContract` (the current `@lokalise/api-contracts` API).
- [`buildFastifyRoute`](#buildfastifyroute) / [`buildFastifyRouteHandler`](#buildfastifyroutehandler) — for contracts created with the deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` builders.

### `buildFastifyApiRoute`

`buildFastifyApiRoute` produces a complete Fastify `RouteOptions` from a contract created with `defineApiContract`. The HTTP method, URL, request schemas and response schema are all derived from the contract, and the handler shape is inferred from the contract's `responsesByStatusCode`:

| Mode | Contract shape | Handler |
|------|----------------|---------|
| **non-SSE** | all success responses are plain Zod schemas / `ContractNoBody` / `textResponse` / `blobResponse` | `(request, reply) => { status, body }` |
| **SSE-capable** | at least one success response is `sseResponse(...)` (SSE-only or mixed with non-SSE via `anyOfResponses`) | `(request, reply, sse) => { status, body } \| stream` |

A single handler covers both representations of an SSE-capable contract: it runs shared logic once and then either returns a non-SSE `{ status, body }` response (e.g. a `404` shared with the streaming path, or the JSON variant of a mixed contract) or calls `sse.start(...)` to stream. The `sse` context is only present on the handler signature when the contract actually declares an SSE response, so non-SSE routes never see it.

#### Non-SSE routes

Non-SSE handlers always return `{ status, body }`. The `status` is the HTTP status code to send; `body` is validated against the schema declared for that status code. Use `reply.header()` to set response headers (do not call `reply.send()`).

```ts
import { buildFastifyApiRoute } from '@lokalise/fastify-api-contracts'
import { ContractNoBody, defineApiContract } from '@lokalise/api-contracts'

const getUserContract = defineApiContract({
    method: 'get',
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    responsesByStatusCode: { 200: USER_SCHEMA, 404: NOT_FOUND_SCHEMA },
})

const deleteUserContract = defineApiContract({
    method: 'delete',
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    responsesByStatusCode: { 204: ContractNoBody },
})

const getRoute = buildFastifyApiRoute(getUserContract, async (request) => {
    const user = await userService.findById(request.params.userId)
    if (!user) return { status: 404, body: { error: 'Not found' } }
    return { status: 200, body: user }
})

const deleteRoute = buildFastifyApiRoute(deleteUserContract, async (request) => {
    await userService.delete(request.params.userId)
    return { status: 204, body: undefined }
})

app.withTypeProvider<ZodTypeProvider>().route(getRoute)
app.withTypeProvider<ZodTypeProvider>().route(deleteRoute)

await app.ready()
```

The `body` type is inferred from the contract entry for that status code: a Zod schema → its output, `ContractNoBody` → `undefined`, `textResponse(...)` → `string | Buffer | Readable`, and `blobResponse(...)` → `Buffer | Readable`. `textResponse` and `blobResponse` differ only in the declared `content-type` (and how the client decodes the body), so both accept a `Buffer` or a Node `Readable` stream — Fastify pipes the stream, ideal for serving large or file-backed bodies without buffering them in memory. The framework sets the response `content-type` from the contract's declared type, so the client can match it.

```ts
import { blobResponse } from '@lokalise/api-contracts'
import { createReadStream } from 'node:fs'

const downloadContract = defineApiContract({
    method: 'get',
    pathResolver: (p) => `/files/${p.id}`,
    requestPathParamsSchema: z.object({ id: z.string() }),
    responsesByStatusCode: { 200: blobResponse('application/pdf') },
})

const downloadRoute = buildFastifyApiRoute(downloadContract, (request) => ({
    status: 200,
    body: createReadStream(`./files/${request.params.id}.pdf`), // or a Buffer
}))
```

#### SSE-only routes

Every handler returns `{ status, body }`. For an SSE response the `body` is an `AsyncIterable` of events — the handler streams in one of two ways:

- **Declarative (preferred):** return `{ status, body }` where `body` is an `AsyncIterable` of events (e.g. an `async function*`). The framework opens the connection, validates and sends each event against the contract's event schemas, then closes it (`autoClose`).
- **Imperative:** receive the `sse` context as the **third** argument and call `sse.start(mode)` (`'autoClose'` closes when the handler returns; `'keepAlive'` keeps it open), then return nothing. The returned `session` exposes `send(event, data)`, `isConnected()`, `sendStream(iterable)` and `getStream()`. Use this when you need keep-alive, lifecycle hooks, or reconnection.

To respond without streaming, return `{ status, body }` with a non-SSE body (the status must be a non-SSE response declared on the contract).

```ts
import { sseResponse } from '@lokalise/api-contracts'

const streamContract = defineApiContract({
    method: 'get',
    pathResolver: () => '/updates/stream',
    responsesByStatusCode: {
        200: sseResponse({
            update: z.object({ value: z.number() }),
            done: z.object({ total: z.number() }),
        }),
    },
})

// Declarative: the body is an async iterable of events.
const streamRoute = buildFastifyApiRoute(streamContract, (_request) => ({
    status: 200,
    body: (async function* () {
        yield { event: 'update', data: { value: 1 } }
        yield { event: 'done', data: { total: 1 } }
    })(),
}))

// Imperative: drive the session via the sse context (keep-alive, hooks, etc.).
const streamRouteImperative = buildFastifyApiRoute(streamContract, async (_request, _reply, sse) => {
    const session = sse.start('autoClose')
    await session.send('update', { value: 1 })
    await session.send('done', { total: 1 })
})
```

#### Mixed (SSE + non-SSE) routes

When a success response built with `anyOfResponses([...])` mixes a JSON schema and an `sseResponse(...)`, the contract is SSE-capable and uses the same single handler. That status's `body` type is then a union — the JSON payload **or** an `AsyncIterable` of events — so the handler returns `{ status, body }` with whichever it wants. Shared logic (auth, loading, validation) runs once, then the handler decides. It is free to base that decision on anything; the `determineMode(request.headers.accept)` helper resolves the client's `Accept` header (with `q=` quality values) to `'json'` or `'sse'`.

```ts
import { anyOfResponses, sseResponse } from '@lokalise/api-contracts'
import { determineMode } from '@lokalise/fastify-api-contracts'

const chatContract = defineApiContract({
    method: 'post',
    requestBodySchema: z.object({ message: z.string() }),
    pathResolver: () => '/chat',
    responsesByStatusCode: {
        200: anyOfResponses([
            z.object({ reply: z.string() }),
            sseResponse({ chunk: z.object({ delta: z.string() }), done: z.object({}) }),
        ]),
        404: z.object({ error: z.string() }),
    },
})

const chatRoute = buildFastifyApiRoute(chatContract, async (request, _reply, _sse) => {
    const conversation = await conversations.find(request.body.message)
    if (!conversation) return { status: 404, body: { error: 'Not found' } } // shared by both

    if (determineMode(request.headers.accept) === 'sse') {
        return {
            status: 200,
            body: (async function* () {
                for await (const chunk of stream(conversation)) {
                    yield { event: 'chunk', data: { delta: chunk } }
                }
                yield { event: 'done', data: {} }
            })(),
        }
    }

    return { status: 200, body: { reply: await complete(conversation) } }
})
```

Only response entries that carry a JSON body contribute to `schema.response`. `ContractNoBody`, `textResponse`, `blobResponse` and `sseResponse` entries are skipped, since they have no Zod serializer schema; `anyOfResponses` entries contribute the union of their JSON members.

#### Options

`buildFastifyApiRoute` accepts an optional third argument. Any [Fastify `RouteOptions`](https://fastify.dev/docs/latest/Reference/Routes/) field (`preHandler`, `onRequest`, `config`, `bodyLimit`, …) is forwarded directly. In addition:

| Option | Description |
|--------|-------------|
| `onConnect` / `onClose` / `onReconnect` | SSE connection lifecycle hooks (ignored for non-SSE routes) |
| `serializer` | Custom serializer for SSE event data |
| `heartbeatInterval` | Interval in ms for SSE keep-alive heartbeats |
| `contractMetadataToRouteMapper` | Maps the contract `metadata` to extra Fastify route options (e.g. `config`, `preHandler`) merged into the route |

To define a handler separately from the route, type it with `InferApiHandler`:

```ts
import type { InferApiHandler } from '@lokalise/fastify-api-contracts'

const createUser: InferApiHandler<typeof contract> = async (request) => ({
    status: 201,
    body: await userService.create(request.body),
})

const routes = [buildFastifyApiRoute(contract, createUser)]
```

### `buildFastifyRoute`

> This builder targets the deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` contracts. For contracts created with `defineApiContract`, use [`buildFastifyApiRoute`](#buildfastifyapiroute) instead.

`buildFastifyRoute` is the unified builder that produces a complete Fastify route definition from a contract. It automatically infers the correct handler type from the contract:

- GET/DELETE contracts → handler without `req.body`
- POST/PUT/PATCH contracts → handler with `req.body`

```ts
import { buildFastifyRoute } from '@lokalise/fastify-api-contracts'
import { buildRestContract } from '@lokalise/api-contracts'

// GET route
const getContract = buildRestContract({
    method: 'get',
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    requestQuerySchema: REQUEST_QUERY_SCHEMA,
    requestHeaderSchema: REQUEST_HEADER_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

// POST route
const postContract = buildRestContract({
    method: 'post',
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestBodySchema: REQUEST_BODY_SCHEMA,
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

// DELETE route
const deleteContract = buildRestContract({
    method: 'delete',
    successResponseBodySchema: z.undefined(),
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const getRoute = buildFastifyRoute(getContract, (req) => {
    // req.query, req.params and req.headers are typed from the contract
})

const postRoute = buildFastifyRoute(postContract, (req) => {
    // req.body, req.query, req.params and req.headers are typed from the contract
})

const deleteRoute = buildFastifyRoute(deleteContract, (req) => {
    // req.params is typed from the contract, no req.body
})

app.withTypeProvider<ZodTypeProvider>().route(getRoute)
app.withTypeProvider<ZodTypeProvider>().route(postRoute)
app.withTypeProvider<ZodTypeProvider>().route(deleteRoute)

await app.ready()
```

### `buildFastifyRouteHandler`

Use `buildFastifyRouteHandler` to define the handler separately from the route. It works with any contract type (GET, DELETE, POST, PUT, PATCH) and gives you a `req`/`reply` pair correctly typed from the contract:

```ts
import {
    buildFastifyRoute,
    buildFastifyRouteHandler
} from '@lokalise/fastify-api-contracts'
import { buildRestContract } from '@lokalise/api-contracts'

const contract = buildRestContract({
    method: 'post',
    requestBodySchema: REQUEST_BODY_SCHEMA,
    successResponseBodySchema: BODY_SCHEMA,
    requestPathParamsSchema: PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const handler = buildFastifyRouteHandler(contract,
    async (req, reply) => {
        // handler definition here, req and reply will be correctly typed based on the contract
    }
)

const routes = [
    buildFastifyRoute(contract, handler),
]
```

### Accessing the contract

In case you need some of the contract data within your lifecycle hook or a handler, it is exposed as a part of the route config, and can be accessed like this:

```ts
const route = buildFastifyRoute(contract, (req) => {
    const { apiContract } = req.routeOptions.config
})
```

### Adding extra route options from contract metadata

`buildFastifyRoute` accepts an optional third argument: a callback that receives the contract metadata and returns extra Fastify route options (such as `config`, `preHandler`, etc.). Use it to derive route options dynamically from the contract:

```ts
const route = buildFastifyRoute(
    contract,
    (req) => {
        // handler
    },
    (contractMetadata) => ({
        // extra Fastify route options derived from contract metadata
        config: {
            // ...
        },
    }),
)
```

## Test helpers

Test helpers let you dispatch requests against a Fastify instance directly from a contract, without spinning up a real HTTP server. They are intended for tests — in production code, prefer a real HTTP client such as `@lokalise/frontend-http-client`.

Pick the helper that matches how the contract was created:

- [`injectByApiContract`](#injectbyapicontract) — for contracts created with `defineApiContract` (the current `@lokalise/api-contracts` API).
- [`injectByContract`](#injectbycontract) — for contracts created with the deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` builders.

Both share the same core parameter shape (`pathParams`, `body`, `queryParams`, `headers`) and runtime behavior — only the contract type they accept differs. `injectByApiContract` additionally accepts an optional `pathPrefix`.

### `injectByApiContract`

`injectByApiContract` dispatches a request through Fastify's [`inject`](https://fastify.dev/docs/latest/Guides/Testing/) for contracts created with `defineApiContract`, automatically determining the HTTP method from the contract.

The params type is resolved directly from the contract (the same way the contract client's request params are), so each field is required only when the corresponding request schema is present:

- `pathParams` — required when `requestPathParamsSchema` is defined
- `body` — required when `requestBodySchema` is a schema (omitted for GET/DELETE and for `ContractNoBody`)
- `queryParams` — required when `requestQuerySchema` is defined
- `headers` — required when `requestHeaderSchema` is defined; accepts a plain object or a (sync or async) function
- `pathPrefix` — always optional; when provided, it is prepended to the path resolved from the contract (e.g. to hit a route mounted under a Fastify prefix)

```ts
import { injectByApiContract } from '@lokalise/fastify-api-contracts'
import { ContractNoBody, defineApiContract } from '@lokalise/api-contracts'

const createUserContract = defineApiContract({
    method: 'post',
    requestBodySchema: REQUEST_BODY_SCHEMA,
    requestPathParamsSchema: PATH_PARAMS_SCHEMA,
    requestHeaderSchema: HEADERS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
})

// POST request — body is required and typed from the contract; headers are required
// because the contract declares requestHeaderSchema
const postResponse = await injectByApiContract(app, createUserContract, {
    pathParams: { userId: '1' },
    body: { id: '2' },
    headers: async () => ({ authorization: 'some-value' }), // plain object or (a)sync function
})

const pingContract = defineApiContract({
    method: 'get',
    pathResolver: () => '/ping',
    responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

// A contract with no request schemas needs no input fields
const pingResponse = await injectByApiContract(app, pingContract, {})
```

The resolved params type is also exported as `InjectByApiContractParams<typeof contract>`, which is handy for building typed request factories in tests.

### `injectByContract`

`injectByContract` dispatches a request through Fastify's [`inject`](https://fastify.dev/docs/latest/Guides/Testing/) and automatically determines the HTTP method from the contract. It replaces the per-method `injectGet`/`injectDelete`/`injectPost`/`injectPut`/`injectPatch` helpers.

> It targets the deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` contracts. For contracts created with `defineApiContract`, use [`injectByApiContract`](#injectbyapicontract) instead.

The params type is automatically resolved from the contract:

- GET/DELETE contracts → params without a request body
- POST/PUT/PATCH contracts → params with a request body

```ts
import { injectByContract } from '@lokalise/fastify-api-contracts'

// POST request — body is required and typed from the contract
const postResponse = await injectByContract(app, postContract, {
    pathParams: { userId: '1' },
    body: { id: '2' },
    headers: { authorization: 'some-value' }, // can be passed directly
})

// GET request — no body
const getResponse = await injectByContract(app, getContract, {
    pathParams: { userId: '1' },
    headers: async () => ({ authorization: 'some-value' }), // a sync or async headers-producing function can be passed as well
})
```

`headers` can be provided either as a plain object or as a (sync or async) function that produces the headers — useful when authentication tokens need to be resolved per request.

## Deprecated APIs

The following functions are deprecated and will be removed in a future version. Use the unified replacements instead:

| Deprecated | Replacement |
|---|---|
| `buildFastifyNoPayloadRoute` | `buildFastifyRoute` |
| `buildFastifyNoPayloadRouteHandler` | `buildFastifyRouteHandler` |
| `buildFastifyPayloadRoute` | `buildFastifyRoute` |
| `buildFastifyPayloadRouteHandler` | `buildFastifyRouteHandler` |
| `injectGet` | `injectByContract` |
| `injectDelete` | `injectByContract` |
| `injectPost` | `injectByContract` |
| `injectPut` | `injectByContract` |
| `injectPatch` | `injectByContract` |
