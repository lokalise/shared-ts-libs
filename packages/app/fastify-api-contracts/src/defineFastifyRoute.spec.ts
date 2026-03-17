import { ContractNoBody, defineRouteContract } from '@lokalise/api-contracts'
import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { describe, expect, expectTypeOf, it, onTestFinished } from 'vitest'
import { z } from 'zod/v4'
import { defineFastifyRoute, defineFastifyRouteHandler } from './defineFastifyRoute.ts'
import { injectByRouteContract } from './injectByRouteContract.ts'
import type { RouteType } from './types.ts'

async function initApp<Route extends RouteType>(route: Route) {
  const app = fastify({ logger: false, disableRequestLogging: true })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.withTypeProvider<ZodTypeProvider>().route(route)
  await app.ready()
  onTestFinished(() => app.close())
  return app
}

describe('defineFastifyRouteHandler', () => {
  it('returns a function', () => {
    const contract = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
    })

    const handler = defineFastifyRouteHandler(contract, () => Promise.resolve({ id: '1' }))
    expect(handler).toBeTypeOf('function')
  })

  it('infers path params type from contract', () => {
    const contract = defineRouteContract({
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
      responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
    })

    defineFastifyRouteHandler(contract, (req) => {
      expectTypeOf(req.params).toEqualTypeOf<{ userId: string }>()
    })
  })

  it('infers query type from contract', () => {
    const contract = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      requestQuerySchema: z.object({ limit: z.number() }),
    })

    defineFastifyRouteHandler(contract, (req) => {
      expectTypeOf(req.query).toEqualTypeOf<{ limit: number }>()
    })
  })

  it('infers body type from POST contract', () => {
    const contract = defineRouteContract({
      method: 'post',
      pathResolver: () => '/users',
      requestBodySchema: z.object({ name: z.string() }),
      responseSchemasByStatusCode: { 201: z.object({ id: z.string() }) },
    })

    defineFastifyRouteHandler(contract, (req) => {
      expectTypeOf(req.body).toEqualTypeOf<{ name: string }>()
    })
  })

  it('infers header type from contract', () => {
    const contract = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      requestHeaderSchema: z.object({ authorization: z.string() }),
    })

    defineFastifyRouteHandler(contract, (req) => {
      expectTypeOf(req.headers).toHaveProperty('authorization')
    })
  })
})

describe('defineFastifyRoute', () => {
  describe('GET routes', () => {
    it('registers and handles a GET route', async () => {
      expect.assertions(2)

      const contract = defineRouteContract({
        method: 'get',
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: ({ userId }) => `/users/${userId}`,
        responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
      })

      const route = defineFastifyRoute(contract, (req) => {
        expect(req.params.userId).toBe('42')
        return Promise.resolve({ id: '42' })
      })

      const app = await initApp(route)
      const response = await injectByRouteContract(app, contract, { pathParams: { userId: '42' } })

      expect(response.statusCode).toBe(200)
    })

    it('sets method and url from contract', () => {
      const contract = defineRouteContract({
        method: 'get',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/items/${id}`,
      })

      const route = defineFastifyRoute(contract, () => Promise.resolve())

      expect(route.method).toBe('get')
      expect(route.url).toBe('/items/:id')
    })

    it('stores the contract on config.apiContract', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/users',
      })

      const route = defineFastifyRoute(contract, () => Promise.resolve())

      expect(route.config.apiContract).toBe(contract)
    })

    it('handles query params', async () => {
      expect.assertions(2)

      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/search',
        requestQuerySchema: z.object({ q: z.string() }),
      })

      const route = defineFastifyRoute(contract, (req) => {
        expect(req.query.q).toBe('hello')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectByRouteContract(app, contract, { queryParams: { q: 'hello' } })

      expect(response.statusCode).toBe(200)
    })

    it('handles request headers', async () => {
      expect.assertions(2)

      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/protected',
        requestHeaderSchema: z.object({ authorization: z.string() }),
      })

      const route = defineFastifyRoute(contract, (req) => {
        expect(req.headers.authorization).toBe('Bearer token')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectByRouteContract(app, contract, {
        headers: { authorization: 'Bearer token' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('returns correct RouteType', () => {
      const RESPONSE_SCHEMA = z.object({ id: z.string() })
      const PATH_PARAMS_SCHEMA = z.object({ userId: z.string() })
      const QUERY_SCHEMA = z.object({ limit: z.number() })
      const HEADERS_SCHEMA = z.object({ authorization: z.string() })

      const contract = defineRouteContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: ({ userId }) => `/users/${userId}`,
        requestQuerySchema: QUERY_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        responseSchemasByStatusCode: { 200: RESPONSE_SCHEMA },
      })

      const route = defineFastifyRoute(contract, () => Promise.resolve({ id: '1' }))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof RESPONSE_SCHEMA>,
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          z.infer<typeof QUERY_SCHEMA>,
          z.infer<typeof HEADERS_SCHEMA>
        >
      >()
    })
  })

  describe('POST routes', () => {
    it('registers and handles a POST route', async () => {
      expect.assertions(3)

      const contract = defineRouteContract({
        method: 'post',
        pathResolver: () => '/users',
        requestBodySchema: z.object({ name: z.string() }),
        responseSchemasByStatusCode: { 201: z.object({ id: z.string() }) },
      })

      const route = defineFastifyRoute(contract, (req) => {
        expect(req.body.name).toBe('Alice')
        return Promise.resolve({ id: '1' })
      })
      expect(route.config.apiContract).toBe(contract)

      const app = await initApp(route)
      const response = await injectByRouteContract(app, contract, { body: { name: 'Alice' } })

      expect(response.statusCode).toBe(200)
    })

    it('returns correct RouteType for POST', () => {
      const BODY_SCHEMA = z.object({ name: z.string() })
      const RESPONSE_SCHEMA = z.object({ id: z.string() })

      const contract = defineRouteContract({
        method: 'post',
        pathResolver: () => '/users',
        requestBodySchema: BODY_SCHEMA,
        responseSchemasByStatusCode: { 201: RESPONSE_SCHEMA },
      })

      const route = defineFastifyRoute(contract, () => Promise.resolve({ id: '1' }))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof RESPONSE_SCHEMA>,
          z.infer<typeof BODY_SCHEMA>,
          undefined,
          undefined,
          undefined
        >
      >()
    })
  })

  describe('DELETE routes', () => {
    it('registers and handles a DELETE route with ContractNoBody', async () => {
      expect.assertions(2)

      const contract = defineRouteContract({
        method: 'delete',
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: ({ userId }) => `/users/${userId}`,
        responseSchemasByStatusCode: { 204: ContractNoBody },
      })

      const route = defineFastifyRoute(contract, (req) => {
        expect(req.params.userId).toBe('99')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectByRouteContract(app, contract, { pathParams: { userId: '99' } })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('PATCH routes', () => {
    it('registers and handles a PATCH route', async () => {
      expect.assertions(2)

      const contract = defineRouteContract({
        method: 'patch',
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: ({ userId }) => `/users/${userId}`,
        requestBodySchema: z.object({ name: z.string() }),
        responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
      })

      const route = defineFastifyRoute(contract, (req) => {
        expect(req.body.name).toBe('Bob')
        return Promise.resolve({ id: req.params.userId })
      })

      const app = await initApp(route)
      const response = await injectByRouteContract(app, contract, {
        pathParams: { userId: '5' },
        body: { name: 'Bob' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('metadata mapper', () => {
    it('merges mapper config with apiContract', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/users',
        metadata: { roles: ['admin'] },
      })

      const route = defineFastifyRoute(
        contract,
        () => Promise.resolve(),
        (metadata) =>
          metadata?.roles ? { config: { roles: metadata.roles } } : {},
      )

      expect(route.config).toEqual({
        roles: ['admin'],
        apiContract: contract,
      })
    })

    it('preserves apiContract when mapper returns no config', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/users',
      })

      const route = defineFastifyRoute(contract, () => Promise.resolve(), () => ({}))

      expect(route.config).toEqual({ apiContract: contract })
    })
  })
})

describe('injectByRouteContract', () => {
  it('injects GET request with path params and query', async () => {
    expect.assertions(3)

    const contract = defineRouteContract({
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
      requestQuerySchema: z.object({ verbose: z.string().optional() }),
    })

    const route = defineFastifyRoute(contract, (req) => {
      expect(req.params.userId).toBe('7')
      expect(req.query.verbose).toBe('true')
      return Promise.resolve()
    })

    const app = await initApp(route)
    const response = await injectByRouteContract(app, contract, {
      pathParams: { userId: '7' },
      queryParams: { verbose: 'true' },
    })

    expect(response.statusCode).toBe(200)
  })

  it('injects GET request with async header resolver', async () => {
    expect.assertions(2)

    const contract = defineRouteContract({
      method: 'get',
      pathResolver: () => '/secure',
      requestHeaderSchema: z.object({ authorization: z.string() }),
    })

    const route = defineFastifyRoute(contract, (req) => {
      expect(req.headers.authorization).toBe('Bearer async-token')
      return Promise.resolve()
    })

    const app = await initApp(route)
    const response = await injectByRouteContract(app, contract, {
      headers: () => Promise.resolve({ authorization: 'Bearer async-token' }),
    })

    expect(response.statusCode).toBe(200)
  })

  it('injects DELETE request', async () => {
    expect.assertions(2)

    const contract = defineRouteContract({
      method: 'delete',
      requestPathParamsSchema: z.object({ id: z.string() }),
      pathResolver: ({ id }) => `/items/${id}`,
      responseSchemasByStatusCode: { 204: ContractNoBody },
    })

    const route = defineFastifyRoute(contract, (req) => {
      expect(req.params.id).toBe('123')
      return Promise.resolve()
    })

    const app = await initApp(route)
    const response = await injectByRouteContract(app, contract, { pathParams: { id: '123' } })

    expect(response.statusCode).toBe(200)
  })

  it('injects POST request with body and path params', async () => {
    expect.assertions(3)

    const contract = defineRouteContract({
      method: 'post',
      requestPathParamsSchema: z.object({ orgId: z.string() }),
      pathResolver: ({ orgId }) => `/orgs/${orgId}/members`,
      requestBodySchema: z.object({ email: z.string() }),
      responseSchemasByStatusCode: { 201: z.object({ id: z.string() }) },
    })

    const route = defineFastifyRoute(contract, (req) => {
      expect(req.params.orgId).toBe('acme')
      expect(req.body.email).toBe('alice@example.com')
      return Promise.resolve({ id: '1' })
    })

    const app = await initApp(route)
    const response = await injectByRouteContract(app, contract, {
      pathParams: { orgId: 'acme' },
      body: { email: 'alice@example.com' },
    })

    expect(response.statusCode).toBe(200)
  })

  it('injects PUT request', async () => {
    expect.assertions(2)

    const contract = defineRouteContract({
      method: 'put',
      requestPathParamsSchema: z.object({ id: z.string() }),
      pathResolver: ({ id }) => `/items/${id}`,
      requestBodySchema: z.object({ name: z.string() }),
    })

    const route = defineFastifyRoute(contract, (req) => {
      expect(req.body.name).toBe('updated')
      return Promise.resolve()
    })

    const app = await initApp(route)
    const response = await injectByRouteContract(app, contract, {
      pathParams: { id: '1' },
      body: { name: 'updated' },
    })

    expect(response.statusCode).toBe(200)
  })
})
