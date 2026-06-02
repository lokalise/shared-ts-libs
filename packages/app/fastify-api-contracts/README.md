# API contract support for fastify

This package adds support for generating fastify routes using universal API contracts, created with `@lokalise/api-contracts`.

## Table of Contents

- [Requirements](#requirements)
- [Builders](#builders)
  - [`buildFastifyRoute`](#buildfastifyroute)
  - [`buildFastifyRouteHandler`](#buildfastifyroutehandler)
  - [Accessing the contract](#accessing-the-contract)
  - [Adding extra route options from contract metadata](#adding-extra-route-options-from-contract-metadata)
- [Test helpers](#test-helpers)
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

### `buildFastifyRoute`

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

### `injectByContract`

`injectByContract` dispatches a request through Fastify's [`inject`](https://fastify.dev/docs/latest/Guides/Testing/) and automatically determines the HTTP method from the contract. It replaces the per-method `injectGet`/`injectDelete`/`injectPost`/`injectPut`/`injectPatch` helpers.

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
