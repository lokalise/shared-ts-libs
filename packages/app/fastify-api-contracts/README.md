# fastify-api-contracts

Fastify route definitions and test helpers built from `@lokalise/api-contracts` contracts. Requires `fastify-type-provider-zod` and is ESM-only.

## Defining routes

Use `defineFastifyRoute` to build a complete Fastify route from a `defineRouteContract` contract. All request and response types are inferred automatically.

```ts
import { defineRouteContract, ContractNoBody } from '@lokalise/api-contracts'
import { defineFastifyRoute } from '@lokalise/fastify-api-contracts'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'

const getUser = defineRouteContract({
  method: 'get',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: { 200: z.object({ id: z.string(), name: z.string() }) },
})

const createUser = defineRouteContract({
  method: 'post',
  pathResolver: () => '/users',
  requestBodySchema: z.object({ name: z.string() }),
  responseSchemasByStatusCode: { 201: z.object({ id: z.string(), name: z.string() }) },
})

const deleteUser = defineRouteContract({
  method: 'delete',
  requestPathParamsSchema: z.object({ userId: z.string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responseSchemasByStatusCode: { 204: ContractNoBody },
})

const getUserRoute = defineFastifyRoute(getUser, (req) => {
  // req.params.userId is typed as string
  return Promise.resolve({ id: req.params.userId, name: 'Alice' })
})

const createUserRoute = defineFastifyRoute(createUser, (req) => {
  // req.body.name is typed as string
  return Promise.resolve({ id: '1', name: req.body.name })
})

const deleteUserRoute = defineFastifyRoute(deleteUser, (req) => {
  // req.params.userId is typed as string, no body
  return Promise.resolve()
})

const app = fastify()
app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

app.withTypeProvider<ZodTypeProvider>().route(getUserRoute)
app.withTypeProvider<ZodTypeProvider>().route(createUserRoute)
app.withTypeProvider<ZodTypeProvider>().route(deleteUserRoute)

await app.ready()
```

## Separating handler from route definition

Use `defineFastifyRouteHandler` when you need to define the handler separately from the route registration — for example, to split handler logic from route setup.

```ts
import { defineFastifyRoute, defineFastifyRouteHandler } from '@lokalise/fastify-api-contracts'

const handler = defineFastifyRouteHandler(createUser, async (req) => {
  return { id: '1', name: req.body.name }
})

const route = defineFastifyRoute(createUser, handler)
```

## Metadata mapper

Pass an optional third argument to map contract metadata to Fastify route options (hooks, config, `bodyLimit`, etc.):

```ts
const route = defineFastifyRoute(
  createUser,
  handler,
  (metadata) => ({
    config: { roles: metadata?.roles },
    preHandler: [authHook],
  }),
)
```

## Accessing the contract in a handler or hook

The contract is available on `req.routeOptions.config.apiContract`:

```ts
const route = defineFastifyRoute(contract, (req) => {
  const { apiContract } = req.routeOptions.config
})
```

## Testing with `injectByRouteContract`

`injectByRouteContract` injects requests into a Fastify app in tests. The `params` type is inferred from the contract — `body` is only present for POST/PUT/PATCH.

```ts
import { injectByRouteContract } from '@lokalise/fastify-api-contracts'

// GET
const getResponse = await injectByRouteContract(app, getUser, {
  pathParams: { userId: '1' },
})

// POST
const createResponse = await injectByRouteContract(app, createUser, {
  body: { name: 'Alice' },
})

// DELETE
const deleteResponse = await injectByRouteContract(app, deleteUser, {
  pathParams: { userId: '1' },
})

// headers can be a plain object, a sync function, or an async function
const response = await injectByRouteContract(app, getUser, {
  pathParams: { userId: '1' },
  headers: async () => ({ authorization: await getToken() }),
})
```

---

## Deprecated API

> The functions below are **deprecated** and will be removed in a future version. Use `defineFastifyRoute`, `defineFastifyRouteHandler`, and `injectByRouteContract` instead.

| Deprecated | Replacement |
|---|---|
| `buildFastifyRoute` | `defineFastifyRoute` |
| `buildFastifyRouteHandler` | `defineFastifyRouteHandler` |
| `injectByContract` | `injectByRouteContract` |
| `buildFastifyNoPayloadRoute` | `defineFastifyRoute` |
| `buildFastifyNoPayloadRouteHandler` | `defineFastifyRouteHandler` |
| `buildFastifyPayloadRoute` | `defineFastifyRoute` |
| `buildFastifyPayloadRouteHandler` | `defineFastifyRouteHandler` |
| `injectGet` | `injectByRouteContract` |
| `injectDelete` | `injectByRouteContract` |
| `injectPost` | `injectByRouteContract` |
| `injectPut` | `injectByRouteContract` |
| `injectPatch` | `injectByRouteContract` |
