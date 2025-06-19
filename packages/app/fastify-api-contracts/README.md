# API contract support for fastify

This package adds support for generating fastify routes using universal API contracts, created with `@lokalise/api-contracts`

This module requires `fastify-type-provider-zod` type provider to work and is ESM-only.

## Usage

Basic usage pattern:

```ts
import { buildFastifyNoPayloadRoute, buildFastifyPayloadRoute, injectPost, injectGet } from '@lokalise/fastify-api-contracts'

import { buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import {
    type ZodTypeProvider,
    serializerCompiler,
    validatorCompiler,
} from 'fastify-type-provider-zod'

const getContract = buildGetRoute({
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestPathParamsSchema: REQUEST_PATH_PARAMS_SCHEMA,
    requestQuerySchema: REQUEST_QUERY_SCHEMA,
    requestHeaderSchema: REQUEST_HEADER_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const postContract = buildPayloadRoute({
    method: 'post', // can also be 'patch' or 'post'
    successResponseBodySchema: RESPONSE_BODY_SCHEMA,
    requestBodySchema: REQUEST_BODY_SCHEMA,
    pathResolver: () => '/',
})

const getRoute = buildFastifyNoPayloadRoute(getContract, (req) => {
    // req.query, req.params and req.headers represent fields from the contract
}, (contractMetadata) => {
    // Optionally, use this callback to dynamically add extra Fastify route options (like config, preHandler, etc.) using contract metadata.
})

const postRoute = buildFastifyPayloadRoute(postContract, (req) => {
    // req.body, req.query, req.params and req.headers represent fields from the contract
}, (contractMetadata) => {
    // Optionally, use this callback to dynamically add extra Fastify route options (like config, preHandler, etc.) using contract metadata.
})

const app = fastify({
    // app params
})

app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

app.withTypeProvider<ZodTypeProvider>().route(getRoute)
app.withTypeProvider<ZodTypeProvider>().route(postRoute)

await app.ready()

// used in tests, you can use '@lokalise/frontend-http-client' in production code
const postResponse = await injectPost(app, contract, {
    pathParams: { userId: '1'},
    body: { id: '2' },
    headers: { authorization: 'some-value'} // can be passed directly
})

// used in tests, you can use '@lokalise/frontend-http-client' in production code
const getResponse = await injectGet(app, contract, {
    pathParams: { userId: '1' },
    headers: async () => { authorization: 'some-value'} // headers producing function (sync or async) can be passed as well
})
```

In case you prefer to separate handler definition from route definition, you can use functions `buildFastifyNoPayloadRouteHandler` (for GET and DELETE handlers) and `buildFastifyPayloadRouteHandler` (for PUT, POST and PATCH handlers):

```ts
import { 
    buildFastifyPayloadRoute, 
    buildFastifyPayloadRouteHandler 
} from '@lokalise/fastify-api-contracts'
import { buildPayloadRoute } from '@lokalise/api-contracts'

const contract = buildPayloadRoute({
    method: 'post',
    requestBodySchema: REQUEST_BODY_SCHEMA,
    successResponseBodySchema: BODY_SCHEMA,
    requestPathParamsSchema: PATH_PARAMS_SCHEMA,
    pathResolver: (pathParams) => `/users/${pathParams.userId}`,
})

const handler = buildFastifyPayloadRouteHandler(contract,
    async (req, reply) => {
        // handler definition here, req and reply will be correctly typed based on the contract
    }
)

const routes = [
    buildFastifyPayloadRoute(contract, handler),
]
```

## Accessing the contract

In case you need some of the contract data within your lifecycle hook or a handler, it is exposed as a part of a route config, and can be accessed like this:

```ts
const route = buildFastifyNoPayloadRoute(contract, (req) => {
    const { apiContract } = req.routeOptions.config
})
```
