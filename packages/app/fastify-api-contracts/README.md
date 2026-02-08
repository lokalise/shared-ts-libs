# API contract support for fastify

This package adds support for generating fastify routes using universal API contracts, created with `@lokalise/api-contracts`

This module requires `fastify-type-provider-zod` type provider to work and is ESM-only.

## Usage

Basic usage pattern using the unified `buildFastifyRoute` builder:

```ts
import { buildFastifyRoute, buildFastifyRouteHandler, injectPost, injectGet } from '@lokalise/fastify-api-contracts'
import { buildRestContract } from '@lokalise/api-contracts'
import {
    type ZodTypeProvider,
    serializerCompiler,
    validatorCompiler,
} from 'fastify-type-provider-zod'

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
    pathResolver: () => '/',
})

// DELETE route
const deleteContract = buildRestContract({
    method: 'delete',
    successResponseBodySchema: z.undefined(),
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

// buildFastifyRoute automatically infers the correct handler type from the contract:
// - GET/DELETE contracts -> handler without req.body
// - POST/PUT/PATCH contracts -> handler with req.body
const getRoute = buildFastifyRoute(getContract, (req) => {
    // req.query, req.params and req.headers are typed from the contract
}, (contractMetadata) => {
    // Optionally, use this callback to dynamically add extra Fastify route options
    // (like config, preHandler, etc.) using contract metadata.
})

const postRoute = buildFastifyRoute(postContract, (req) => {
    // req.body, req.query, req.params and req.headers are typed from the contract
})

const deleteRoute = buildFastifyRoute(deleteContract, (req) => {
    // req.params is typed from the contract, no req.body
})

const app = fastify({
    // app params
})

app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

app.withTypeProvider<ZodTypeProvider>().route(getRoute)
app.withTypeProvider<ZodTypeProvider>().route(postRoute)
app.withTypeProvider<ZodTypeProvider>().route(deleteRoute)

await app.ready()

// used in tests, you can use '@lokalise/frontend-http-client' in production code
const postResponse = await injectPost(app, postContract, {
    pathParams: { userId: '1'},
    body: { id: '2' },
    headers: { authorization: 'some-value'} // can be passed directly
})

// used in tests, you can use '@lokalise/frontend-http-client' in production code
const getResponse = await injectGet(app, getContract, {
    pathParams: { userId: '1' },
    headers: async () => { authorization: 'some-value'} // headers producing function (sync or async) can be passed as well
})
```

### Separating handler from route definition

Use `buildFastifyRouteHandler` to define the handler separately from the route. It works with any contract type (GET, DELETE, POST, PUT, PATCH):

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

## Accessing the contract

In case you need some of the contract data within your lifecycle hook or a handler, it is exposed as a part of a route config, and can be accessed like this:

```ts
const route = buildFastifyRoute(contract, (req) => {
    const { apiContract } = req.routeOptions.config
})
```

## Deprecated builders

The following functions are deprecated and will be removed in a future version. Use the unified builders instead:

| Deprecated | Replacement |
|---|---|
| `buildFastifyNoPayloadRoute` | `buildFastifyRoute` |
| `buildFastifyNoPayloadRouteHandler` | `buildFastifyRouteHandler` |
| `buildFastifyPayloadRoute` | `buildFastifyRoute` |
| `buildFastifyPayloadRouteHandler` | `buildFastifyRouteHandler` |
