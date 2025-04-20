import { buildDeleteRoute, buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import { fastify } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  buildFastifyNoPayloadRoute,
  buildFastifyNoPayloadRouteHandler,
  buildFastifyPayloadRoute,
  buildFastifyPayloadRouteHandler,
} from './fastifyApiContracts.js'
import {
  injectDelete,
  injectGet,
  injectPatch,
  injectPost,
  injectPut,
} from './fastifyApiRequestInjector.js'
import type { RouteType } from './types.js'

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

describe('fastifyApiContracts', () => {
  describe('buildFastifyNoPayloadRouteHandler', () => {
    it('builds a GET handler', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyNoPayloadRouteHandler(contract, () => Promise.resolve())
      expect(handler).toBeTypeOf('function')
    })
  })
  describe('buildFastifyNoPayloadRoute', () => {
    it('uses API spec to build valid GET route in fastify app', async () => {
      expect.assertions(4)
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyNoPayloadRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        // satisfies checks if type is inferred properly in route
        expect(req.query.testIds satisfies string[] | undefined).toBeUndefined()
        return Promise.resolve(JSON.stringify({}))
      })

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

    it('uses API spec to build valid GET route with header factory in fastify app', async () => {
      expect.assertions(3)
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyNoPayloadRouteHandler(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        // satisfies checks if type is inferred properly in handler
        expect(req.query.testIds satisfies string[] | undefined).toEqual(['test-id'])
        return Promise.resolve()
      })

      const route = buildFastifyNoPayloadRoute(contract, handler)

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

    it('uses API spec to build valid GET route with potentially empty response in fastify app', async () => {
      expect.assertions(4)
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        isEmptyResponseExpected: true,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyNoPayloadRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        // satisfies checks if type is inferred properly in route
        expect(req.query.testIds satisfies string[] | undefined).toBeUndefined()
        return Promise.resolve()
      })

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
      expect(response.body).toBe('')
    })

    it('uses API spec to build valid DELETE route in fastify app', async () => {
      expect.assertions(2)
      const contract = buildDeleteRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyNoPayloadRoute(contract, (req) => {
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

    it('uses API spec to build valid DELETE route with header in fastify app', async () => {
      expect.assertions(4)
      const contract = buildDeleteRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyNoPayloadRoute(contract, (req) => {
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
      // using headers directly
      const response = await injectDelete(app, contract, {
        headers: { authorization: 'dummy' },
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(200)

      // using headers factory
      const response2 = await injectDelete(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
      })

      expect(response2.statusCode).toBe(200)
    })
  })

  describe('buildFastifyPayloadRouteHandler', () => {
    it('builds a POST handler', () => {
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyPayloadRouteHandler(contract, () => Promise.resolve())
      expect(handler).toBeTypeOf('function')
    })
  })
  describe('buildFastifyPayloadRoute', () => {
    it('uses API spec to build valid POST route in fastify app', async () => {
      expect.assertions(3)
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyPayloadRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        return Promise.resolve()
      })

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

    it('uses API spec to build valid POST route with header factory in fastify app', async () => {
      expect.assertions(4)
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyPayloadRouteHandler(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        expect(req.headers.authorization).toEqual('dummy')
        return Promise.resolve()
      })

      const route = buildFastifyPayloadRoute(contract, handler)

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

    it('uses API spec to build valid PATCH route in fastify app', async () => {
      expect.assertions(3)
      const contract = buildPayloadRoute({
        method: 'patch',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyPayloadRoute(contract, (req) => {
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

    it('uses API spec to build valid PATCH route with header factory in fastify app', async () => {
      expect.assertions(4)
      const contract = buildPayloadRoute({
        method: 'patch',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyPayloadRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        expect(req.headers.authorization).toEqual('dummy')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectPatch(app, contract, {
        headers: () => ({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('uses API spec to build valid PUT route in fastify app', async () => {
      expect.assertions(3)
      const contract = buildPayloadRoute({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyPayloadRoute(contract, (req) => {
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

    it('uses API spec to build valid PUT route with header in fastify app', async () => {
      expect.assertions(8)
      const contract = buildPayloadRoute({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyPayloadRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        expect(req.headers.authorization).toEqual('dummy')
        return Promise.resolve()
      })

      const app = await initApp(route)
      // using headers directly
      const response = await injectPut(app, contract, {
        headers: { authorization: 'dummy' },
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)

      // using headers factory
      const response2 = await injectPut(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response2.statusCode).toBe(200)
    })

    it('supports isNonJSONResponseExpected and isEmptyResponseExpected parameters', async () => {
      expect.assertions(4)
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: z.undefined(),
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        isEmptyResponseExpected: true,
        isNonJSONResponseExpected: true,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyPayloadRouteHandler(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        expect(req.headers.authorization).toEqual('dummy')
        return Promise.resolve()
      })

      const route = buildFastifyPayloadRoute(contract, handler)

      const app = await initApp(route)
      const response = await injectPost(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })
  })
})
