# API contract support for fastify

This package adds support for generating fastify routes using universal API contracts, created with `@lokalise/api-contracts`.

## Table of Contents

- [Requirements](#requirements)
- [Builders](#builders)
  - [`buildFastifyRouteByApiContract`](#buildfastifyroutebyapicontract)
  - [`buildFastifyRouteHandlerByApiContract`](#buildfastifyroutehandlerbyapicontract)
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

- [`buildFastifyRouteByApiContract`](#buildfastifyroutebyapicontract) / [`buildFastifyRouteHandlerByApiContract`](#buildfastifyroutehandlerbyapicontract) — for contracts created with `defineApiContract` (the current `@lokalise/api-contracts` API).
- [`buildFastifyRoute`](#buildfastifyroute) / [`buildFastifyRouteHandler`](#buildfastifyroutehandler) — for contracts created with the deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` builders.

### `buildFastifyRouteByApiContract`

`buildFastifyRouteByApiContract` produces a complete Fastify route definition from a contract created with `defineApiContract`. The HTTP method, URL, request schemas and response schema are all derived from the contract, and the handler request/reply types are inferred from it:

- GET/DELETE contracts → handler without `req.body`
- POST/PUT/PATCH contracts → handler with `req.body` (typed `undefined` for `ContractNoBody`)

```ts
import { buildFastifyRouteByApiContract } from '@lokalise/fastify-api-contracts'
import { ContractNoBody, defineApiContract } from '@lokalise/api-contracts'

// GET route
const getUserContract = defineApiContract({
    method: 'get',
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    requestQuerySchema: REQUEST_QUERY_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
})

// POST route
const createUserContract = defineApiContract({
    method: 'post',
    requestBodySchema: REQUEST_BODY_SCHEMA,
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
})

// DELETE route returning no body
const deleteUserContract = defineApiContract({
    method: 'delete',
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    responsesByStatusCode: { 204: ContractNoBody },
})

const getRoute = buildFastifyRouteByApiContract(getUserContract, (req) => {
    // req.query, req.params and req.headers are typed from the contract
})

const postRoute = buildFastifyRouteByApiContract(createUserContract, (req) => {
    // req.body, req.query, req.params and req.headers are typed from the contract
})

const deleteRoute = buildFastifyRouteByApiContract(deleteUserContract, (req, reply) => {
    // req.params is typed from the contract, no req.body
    reply.code(204)
})

app.withTypeProvider<ZodTypeProvider>().route(getRoute)
app.withTypeProvider<ZodTypeProvider>().route(postRoute)
app.withTypeProvider<ZodTypeProvider>().route(deleteRoute)

await app.ready()
```

Only response entries that carry a JSON body contribute to `schema.response`. `ContractNoBody`, `textResponse`, `blobResponse` and `sseResponse` entries are skipped, since they have no Zod serializer schema; `anyOfResponses` entries contribute the union of their JSON members.

Like [`buildFastifyRoute`](#buildfastifyroute), it exposes the contract on the route config (see [Accessing the contract](#accessing-the-contract)) and accepts an optional metadata-mapper as a third argument (see [Adding extra route options from contract metadata](#adding-extra-route-options-from-contract-metadata)).

### `buildFastifyRouteHandlerByApiContract`

Use `buildFastifyRouteHandlerByApiContract` to define the handler separately from the route for a `defineApiContract` contract. It gives you a `req`/`reply` pair correctly typed from the contract:

```ts
import {
    buildFastifyRouteByApiContract,
    buildFastifyRouteHandlerByApiContract,
} from '@lokalise/fastify-api-contracts'
import { defineApiContract } from '@lokalise/api-contracts'

const contract = defineApiContract({
    method: 'post',
    requestBodySchema: REQUEST_BODY_SCHEMA,
    requestPathParamsSchema: PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
})

const handler = buildFastifyRouteHandlerByApiContract(contract,
    async (req, reply) => {
        // handler definition here, req and reply will be correctly typed based on the contract
    }
)

const routes = [
    buildFastifyRouteByApiContract(contract, handler),
]
```

### `buildFastifyRoute`

> This builder targets the deprecated `buildRestContract`/`buildGetRoute`/`buildPayloadRoute` contracts. For contracts created with `defineApiContract`, use [`buildFastifyRouteByApiContract`](#buildfastifyroutebyapicontract) instead.

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
