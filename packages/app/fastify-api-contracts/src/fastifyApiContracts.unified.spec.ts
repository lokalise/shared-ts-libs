import { buildRestContract } from '@lokalise/api-contracts'
import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { buildFastifyRoute, buildFastifyRouteHandler } from './fastifyApiContracts.ts'
import {
  injectDelete,
  injectGet,
  injectPatch,
  injectPost,
  injectPut,
} from './fastifyApiRequestInjector.ts'
import type { RouteType } from './types.ts'

const REQUEST_BODY_SCHEMA = z.object({
  id: z.string(),
})
const BODY_SCHEMA = z.object({})
const PATH_PARAMS_SCHEMA = z.object({
  userId: z.string(),
})
const HEADERS_SCHEMA = z.object({
  authorization: z.string(),
})
const arrayPreprocessor = (value: unknown) => (Array.isArray(value) ? value : [value])

const REQUEST_QUERY_SCHEMA = z.object({
  testIds: z.preprocess(arrayPreprocessor, z.array(z.string())).optional(),
  limit: z.coerce.number().gt(0).default(10),
})

async function initApp<Route extends RouteType>(route: Route) {
  const app = fastify({
    logger: false,
    disableRequestLogging: true,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.withTypeProvider<ZodTypeProvider>().route(route)
  await app.ready()
  return app
}

describe('unified buildFastifyRouteHandler', () => {
  it('builds a GET handler', () => {
    const contract = buildRestContract({
      method: 'get',
      successResponseBodySchema: BODY_SCHEMA,
      requestPathParamsSchema: PATH_PARAMS_SCHEMA,
      requestQuerySchema: REQUEST_QUERY_SCHEMA,
      pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    })

    const handler = buildFastifyRouteHandler(contract, () => Promise.resolve())
    expect(handler).toBeTypeOf('function')
  })

  it('builds a DELETE handler', () => {
    const contract = buildRestContract({
      method: 'delete',
      successResponseBodySchema: BODY_SCHEMA,
      requestPathParamsSchema: PATH_PARAMS_SCHEMA,
      pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    })

    const handler = buildFastifyRouteHandler(contract, () => Promise.resolve())
    expect(handler).toBeTypeOf('function')
  })

  it('builds a POST handler', () => {
    const contract = buildRestContract({
      method: 'post',
      requestBodySchema: REQUEST_BODY_SCHEMA,
      successResponseBodySchema: BODY_SCHEMA,
      requestPathParamsSchema: PATH_PARAMS_SCHEMA,
      pathResolver: (pathParams) => `/users/${pathParams.userId}`,
    })

    const handler = buildFastifyRouteHandler(contract, () => Promise.resolve())
    expect(handler).toBeTypeOf('function')
  })
})

describe('unified buildFastifyRoute', () => {
  describe('GET routes', () => {
    it('builds valid GET route in fastify app', async () => {
      expect.assertions(6)
      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyRoute(contract, (req) => {
        expect(req.routeOptions.config.apiContract).toBe(contract)
        expect(req.params.userId).toEqual('1')
        expect(req.query.testIds satisfies string[] | undefined).toBeUndefined()
        return Promise.resolve({})
      })
      expect(route.config.apiContract).toBe(contract)

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          z.infer<typeof REQUEST_QUERY_SCHEMA>,
          undefined
        >
      >()

      const app = await initApp(route)
      const response = await injectGet(app, contract, {
        pathParams: { userId: '1' },
        queryParams: { limit: 10 },
      })

      expect(response.statusCode).toBe(200)
      expect(response.body).toMatchInlineSnapshot(`"{}"`)
    })

    it('builds GET route with headers', async () => {
      expect.assertions(3)
      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyRouteHandler(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.query.testIds satisfies string[] | undefined).toEqual(['test-id'])
        return Promise.resolve()
      })

      const route = buildFastifyRoute(contract, handler)

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          z.infer<typeof REQUEST_QUERY_SCHEMA>,
          z.infer<typeof HEADERS_SCHEMA>
        >
      >()

      const app = await initApp(route)
      const response = await injectGet(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        queryParams: { testIds: ['test-id'] },
      })

      expect(response.statusCode).toBe(200)
    })

    it('builds GET route with empty response', async () => {
      expect.assertions(4)
      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        isEmptyResponseExpected: true,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.query.testIds satisfies string[] | undefined).toBeUndefined()
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectGet(app, contract, {
        pathParams: { userId: '1' },
        queryParams: { limit: 10 },
      })

      expect(response.statusCode).toBe(200)
      expect(response.body).toBe('')
    })
  })

  describe('DELETE routes', () => {
    it('builds valid DELETE route in fastify app', async () => {
      expect.assertions(2)
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        return Promise.resolve()
      })

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          undefined,
          undefined
        >
      >()

      const app = await initApp(route)
      const response = await injectDelete(app, contract, {
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('builds DELETE route with headers', async () => {
      expect.assertions(4)
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        return Promise.resolve()
      })

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          undefined,
          z.infer<typeof HEADERS_SCHEMA>
        >
      >()

      const app = await initApp(route)
      const response = await injectDelete(app, contract, {
        headers: { authorization: 'dummy' },
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(200)

      const response2 = await injectDelete(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
      })

      expect(response2.statusCode).toBe(200)
    })
  })

  describe('POST routes', () => {
    it('builds valid POST route in fastify app', async () => {
      expect.assertions(5)
      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyRoute(contract, (req) => {
        expect(req.routeOptions.config.apiContract).toBe(contract)
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        return Promise.resolve()
      })
      expect(route.config.apiContract).toBe(contract)

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          z.infer<typeof REQUEST_BODY_SCHEMA>,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          undefined,
          undefined
        >
      >()

      const app = await initApp(route)
      const response = await injectPost(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('builds POST route with headers', async () => {
      expect.assertions(4)
      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyRouteHandler(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        expect(req.headers.authorization).toEqual('dummy')
        return Promise.resolve()
      })

      const route = buildFastifyRoute(contract, handler)

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          z.infer<typeof REQUEST_BODY_SCHEMA>,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          undefined,
          z.infer<typeof HEADERS_SCHEMA>
        >
      >()

      const app = await initApp(route)
      const response = await injectPost(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('PATCH routes', () => {
    it('builds valid PATCH route in fastify app', async () => {
      expect.assertions(3)
      const contract = buildRestContract({
        method: 'patch',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectPatch(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('PUT routes', () => {
    it('builds valid PUT route in fastify app', async () => {
      expect.assertions(3)
      const contract = buildRestContract({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectPut(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('builds PUT route with headers', async () => {
      expect.assertions(8)
      const contract = buildRestContract({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        expect(req.headers.authorization).toEqual('dummy')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectPut(app, contract, {
        headers: { authorization: 'dummy' },
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)

      const response2 = await injectPut(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response2.statusCode).toBe(200)
    })

    it('supports isNonJSONResponseExpected and isEmptyResponseExpected', async () => {
      expect.assertions(4)
      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: z.undefined(),
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        isEmptyResponseExpected: true,
        isNonJSONResponseExpected: true,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyRouteHandler(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        expect(req.headers.authorization).toEqual('dummy')
        return Promise.resolve()
      })

      const route = buildFastifyRoute(contract, handler)

      const app = await initApp(route)
      const response = await injectPost(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('metadata mapper', () => {
    it('uses metadata mapper for GET route', () => {
      const SCHEMA = z.object({ id: z.string() })

      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: SCHEMA,
        requestPathParamsSchema: SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.id}`,
        metadata: {
          myProp: ['test1', 'test2'],
        },
      })

      const route = buildFastifyRoute(
        contract,
        () => Promise.resolve(),
        (metadata) =>
          metadata?.myProp
            ? {
                config: {
                  myProp: (metadata.myProp as string[]).join('-'),
                },
              }
            : {},
      )

      expect(route.config).toEqual({
        myProp: 'test1-test2',
        apiContract: expect.any(Object),
      })
    })

    it('uses metadata mapper for POST route', () => {
      const SCHEMA = z.object({ id: z.string() })

      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: SCHEMA,
        successResponseBodySchema: SCHEMA,
        requestPathParamsSchema: SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.id}`,
        metadata: {
          myProp: ['test3', 'test4'],
        },
      })

      const route = buildFastifyRoute(
        contract,
        () => Promise.resolve(),
        (metadata) =>
          metadata?.myProp ? { config: { myProp: (metadata.myProp as string[]).join('-') } } : {},
      )

      expect(route.config).toEqual({
        myProp: 'test3-test4',
        apiContract: expect.any(Object),
      })
    })
  })
})
