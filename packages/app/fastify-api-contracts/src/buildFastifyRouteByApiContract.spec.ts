import {
  blobResponse,
  ContractNoBody,
  defineApiContract,
  sseResponse,
  textResponse,
} from '@lokalise/api-contracts'
import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { describe, expect, expectTypeOf, it, onTestFinished } from 'vitest'
import { z } from 'zod/v4'
import {
  buildFastifyRouteByApiContract,
  buildFastifyRouteHandlerByApiContract,
} from './buildFastifyRouteByApiContract.ts'
import { injectByApiContract } from './injectByApiContract.ts'
import type { RouteType } from './types.ts'

const REQUEST_BODY_SCHEMA = z.object({
  id: z.string(),
})
const RESPONSE_BODY_SCHEMA = z.object({
  name: z.string(),
})
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
  onTestFinished(() => app.close())
  return app
}

describe('buildFastifyRouteHandlerByApiContract', () => {
  it('builds a GET handler', () => {
    const contract = defineApiContract({
      method: 'get',
      requestPathParamsSchema: PATH_PARAMS_SCHEMA,
      pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
    })

    const handler = buildFastifyRouteHandlerByApiContract(contract, () =>
      Promise.resolve({ name: 'test' }),
    )
    expect(handler).toBeTypeOf('function')
  })

  it('builds a POST handler', () => {
    const contract = defineApiContract({
      method: 'post',
      requestBodySchema: REQUEST_BODY_SCHEMA,
      requestPathParamsSchema: PATH_PARAMS_SCHEMA,
      pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
    })

    const handler = buildFastifyRouteHandlerByApiContract(contract, () =>
      Promise.resolve({ name: 'test' }),
    )
    expect(handler).toBeTypeOf('function')
  })
})

describe('buildFastifyRouteByApiContract', () => {
  describe('GET routes', () => {
    it('builds a valid GET route in a fastify app', async () => {
      expect.assertions(6)
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const route = buildFastifyRouteByApiContract(contract, (req) => {
        expect(req.routeOptions.config.apiContract).toBe(contract)
        expect(req.params.userId).toEqual('1')
        expect(req.query.testIds satisfies string[] | undefined).toBeUndefined()
        return Promise.resolve({ name: 'Frodo' })
      })
      expect(route.config.apiContract).toBe(contract)

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          { name: string },
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          z.infer<typeof REQUEST_QUERY_SCHEMA>,
          undefined
        >
      >()

      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        queryParams: { limit: 10 },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ name: 'Frodo' })
    })

    it('builds a GET route with headers', async () => {
      expect.assertions(3)
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const handler = buildFastifyRouteHandlerByApiContract(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.query.testIds satisfies string[] | undefined).toEqual(['test-id'])
        return Promise.resolve({ name: 'Frodo' })
      })

      const route = buildFastifyRouteByApiContract(contract, handler)

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          { name: string },
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          z.infer<typeof REQUEST_QUERY_SCHEMA>,
          z.infer<typeof HEADERS_SCHEMA>
        >
      >()

      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        queryParams: { testIds: ['test-id'] },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('DELETE routes', () => {
    it('builds a valid DELETE route with ContractNoBody response', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'delete',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      const route = buildFastifyRouteByApiContract(contract, (req, reply) => {
        expect(req.params.userId).toEqual('1')
        reply.code(204)
        return Promise.resolve(undefined)
      })

      expectTypeOf(route).toEqualTypeOf<
        RouteType<undefined, undefined, z.infer<typeof PATH_PARAMS_SCHEMA>, undefined, undefined>
      >()

      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(204)
    })
  })

  describe('POST routes', () => {
    it('builds a valid POST route in a fastify app', async () => {
      expect.assertions(5)
      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
      })

      const route = buildFastifyRouteByApiContract(contract, (req, reply) => {
        expect(req.routeOptions.config.apiContract).toBe(contract)
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        reply.code(201)
        return Promise.resolve({ name: 'Frodo' })
      })
      expect(route.config.apiContract).toBe(contract)

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          { name: string },
          z.infer<typeof REQUEST_BODY_SCHEMA>,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          undefined,
          undefined
        >
      >()

      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(201)
    })

    it('builds a POST route with a ContractNoBody request body', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: ContractNoBody,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}/activate`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      const route = buildFastifyRouteByApiContract(contract, (req, reply) => {
        expect(req.params.userId).toEqual('1')
        reply.code(204)
        return Promise.resolve(undefined)
      })

      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(204)
    })

    it('builds a POST route with headers', async () => {
      expect.assertions(4)
      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
      })

      const handler = buildFastifyRouteHandlerByApiContract(contract, (req, reply) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        expect(req.headers.authorization).toEqual('dummy')
        reply.code(201)
        return Promise.resolve({ name: 'Frodo' })
      })

      const route = buildFastifyRouteByApiContract(contract, handler)
      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(201)
    })
  })

  describe('PUT routes', () => {
    it('builds a valid PUT route in a fastify app', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const route = buildFastifyRouteByApiContract(contract, (req) => {
        expect(req.body.id).toEqual('2')
        return Promise.resolve({ name: 'Frodo' })
      })

      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('PATCH routes', () => {
    it('builds a valid PATCH route in a fastify app', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'patch',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const route = buildFastifyRouteByApiContract(contract, (req) => {
        expect(req.body.id).toEqual('2')
        return Promise.resolve({ name: 'Frodo' })
      })

      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('response schema mapping', () => {
    it('validates and serializes the response body against the contract schema', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/profile',
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      // The handler returns an extra field that the response schema strips on serialization.
      const route = buildFastifyRouteByApiContract(contract, () =>
        Promise.resolve({ name: 'Frodo', extra: 'dropped' } as { name: string }),
      )

      const app = await initApp(route)
      const response = await injectByApiContract(app, contract, {})

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ name: 'Frodo' })
    })

    it('skips non-JSON response entries when building schema.response', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/export',
        responsesByStatusCode: {
          200: textResponse('text/csv'),
          400: RESPONSE_BODY_SCHEMA,
        },
      })

      const route = buildFastifyRouteByApiContract(contract, () => Promise.resolve('a,b,c'))

      // Only the JSON (400) entry contributes a serializer schema; the text entry is skipped.
      expect(route.schema?.response).toEqual({ 400: RESPONSE_BODY_SCHEMA })
    })

    it('omits schema.response entirely when no entry carries a JSON body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/download',
        responsesByStatusCode: {
          200: blobResponse('application/octet-stream'),
          204: ContractNoBody,
          500: sseResponse({ error: z.object({ message: z.string() }) }),
        },
      })

      const route = buildFastifyRouteByApiContract(contract, () => Promise.resolve(undefined))

      expect(route.schema?.response).toBeUndefined()
    })
  })

  describe('metadata mapper', () => {
    it('maps contract metadata to extra route options', () => {
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
        metadata: {
          myProp: ['test1', 'test2'],
        },
      })

      const route = buildFastifyRouteByApiContract(
        contract,
        () => Promise.resolve({ name: 'Frodo' }),
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
  })

  describe('type-level inference', () => {
    it('types req.params and reply on a GET handler', () => {
      const getContract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })
      buildFastifyRouteByApiContract(getContract, (req) => {
        expectTypeOf(req.params).toEqualTypeOf<{ userId: string }>()
        return Promise.resolve({ name: 'Frodo' })
      })
    })

    it('types req.body on a payload handler', () => {
      const postContract = defineApiContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        pathResolver: () => '/users',
        responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
      })
      buildFastifyRouteByApiContract(postContract, (req) => {
        expectTypeOf(req.body).toEqualTypeOf<{ id: string }>()
        return Promise.resolve({ name: 'Frodo' })
      })
    })
  })
})
