import {
  type ApiContract,
  ContractNoBody,
  defineApiContract,
  mapApiContractToPath,
} from '@lokalise/api-contracts'
import { copyWithoutUndefined } from '@lokalise/node-core'
import { type FastifyInstance, fastify, type RouteHandlerMethod } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, expectTypeOf, it, onTestFinished } from 'vitest'
import { z } from 'zod/v4'
import { type InjectByApiContractParams, injectByApiContract } from './injectByApiContract.ts'

const REQUEST_BODY_SCHEMA = z.object({
  id: z.string(),
})
const RESPONSE_BODY_SCHEMA = z.object({})
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

/**
 * Registers a single route derived from a `defineApiContract` contract, so the injected request has
 * something to hit. Mirrors how `buildFastifyRoute` would wire schemas, but works with the newer
 * contract shape directly.
 */
async function initAppForContract(
  contract: ApiContract,
  handler: RouteHandlerMethod,
  urlPrefix = '',
): Promise<FastifyInstance> {
  const app = fastify({
    logger: false,
    disableRequestLogging: true,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  const schema = copyWithoutUndefined({
    params: contract.requestPathParamsSchema,
    querystring: contract.requestQuerySchema,
    headers: contract.requestHeaderSchema,
    body: contract.requestBodySchema === ContractNoBody ? undefined : contract.requestBodySchema,
  })

  app.route({
    method: contract.method,
    url: `${urlPrefix}${mapApiContractToPath(contract)}`,
    schema,
    handler,
  })

  await app.ready()
  onTestFinished(() => app.close())
  return app
}

describe('injectByApiContract', () => {
  describe('GET', () => {
    it('injects a GET request with path and query params', async () => {
      expect.assertions(4)
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(contract, (req) => {
        expect(req.params).toEqual({ userId: '1' })
        // the query schema coerces and applies the default, which fastify parses on the way in
        expect(req.query).toEqual({ limit: 10 })
        return Promise.resolve({})
      })

      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        queryParams: { limit: 10 },
      })

      expect(response.statusCode).toBe(200)
      expect(response.body).toMatchInlineSnapshot(`"{}"`)
    })

    it('injects a GET request with a header object', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(contract, (req) => {
        expect(req.headers.authorization).toBe('dummy')
        return Promise.resolve({})
      })

      const response = await injectByApiContract(app, contract, {
        headers: { authorization: 'dummy' },
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('injects a GET request with a sync and async header factory', async () => {
      expect.assertions(4)
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(contract, (req) => {
        expect(req.headers.authorization).toBe('dummy')
        return Promise.resolve({})
      })

      const syncResponse = await injectByApiContract(app, contract, {
        headers: () => ({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
      })
      expect(syncResponse.statusCode).toBe(200)

      const asyncResponse = await injectByApiContract(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
      })
      expect(asyncResponse.statusCode).toBe(200)
    })

    it('injects a GET request for a contract without any request schemas', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/ping',
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(contract, () => Promise.resolve({}))

      const response = await injectByApiContract(app, contract, {})

      expect(response.statusCode).toBe(200)
      expect(response.body).toMatchInlineSnapshot(`"{}"`)
    })

    it('prepends pathPrefix to the resolved path', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      // the route is mounted under a prefix the contract itself is unaware of
      const app = await initAppForContract(
        contract,
        (req) => {
          expect(req.params).toEqual({ userId: '1' })
          return Promise.resolve({})
        },
        '/api/v1',
      )

      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        pathPrefix: '/api/v1',
      })

      expect(response.statusCode).toBe(200)
    })

    it('normalizes a pathPrefix with a trailing slash without doubling the separator', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(
        contract,
        (req) => {
          expect(req.params).toEqual({ userId: '1' })
          return Promise.resolve({})
        },
        '/api/v1',
      )

      // a trailing slash on the prefix must not produce `/api/v1//users/1`
      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        pathPrefix: '/api/v1/',
      })

      expect(response.statusCode).toBe(200)
    })

    it('normalizes a pathPrefix without a leading slash', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(
        contract,
        (req) => {
          expect(req.params).toEqual({ userId: '1' })
          return Promise.resolve({})
        },
        '/api/v1',
      )

      // a missing leading slash must still resolve to `/api/v1/users/1`
      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        pathPrefix: 'api/v1',
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('DELETE', () => {
    it('injects a DELETE request returning no body', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'delete',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      const app = await initAppForContract(contract, (req, reply) => {
        expect(req.params).toEqual({ userId: '1' })
        return reply.code(204).send()
      })

      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(204)
    })
  })

  describe('POST', () => {
    it('injects a POST request with a body', async () => {
      expect.assertions(3)
      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(contract, (req, reply) => {
        expect(req.params).toEqual({ userId: '1' })
        expect(req.body).toEqual({ id: '2' })
        return reply.code(201).send({})
      })

      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(201)
    })

    it('injects a POST request with a body and an async header factory', async () => {
      expect.assertions(4)
      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(contract, (req, reply) => {
        expect(req.params).toEqual({ userId: '1' })
        expect(req.body).toEqual({ id: '2' })
        expect(req.headers.authorization).toBe('dummy')
        return reply.code(201).send({})
      })

      const response = await injectByApiContract(app, contract, {
        headers: () => Promise.resolve({ authorization: 'dummy' }),
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(201)
    })

    it('prepends pathPrefix to the resolved path for a payload route', async () => {
      expect.assertions(3)
      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(
        contract,
        (req, reply) => {
          expect(req.params).toEqual({ userId: '1' })
          expect(req.body).toEqual({ id: '2' })
          return reply.code(201).send({})
        },
        '/api/v1',
      )

      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
        pathPrefix: '/api/v1',
      })

      expect(response.statusCode).toBe(201)
    })

    it('injects a POST request for a contract with a ContractNoBody request body', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'post',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestBodySchema: ContractNoBody,
        pathResolver: (pathParams) => `/users/${pathParams.userId}/activate`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      const app = await initAppForContract(contract, (req, reply) => {
        expect(req.params).toEqual({ userId: '1' })
        return reply.code(204).send()
      })

      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(204)
    })
  })

  describe('PUT', () => {
    it('injects a PUT request with a body', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(contract, (req) => {
        expect(req.body).toEqual({ id: '2' })
        return Promise.resolve({})
      })

      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('PATCH', () => {
    it('injects a PATCH request with a body', async () => {
      expect.assertions(2)
      const contract = defineApiContract({
        method: 'patch',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })

      const app = await initAppForContract(contract, (req) => {
        expect(req.body).toEqual({ id: '2' })
        return Promise.resolve({})
      })

      const response = await injectByApiContract(app, contract, {
        pathParams: { userId: '1' },
        body: { id: '2' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('type-level params resolution', () => {
    it('requires pathParams and body for a payload contract, and forbids body for a GET', () => {
      const postContract = defineApiContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 201: RESPONSE_BODY_SCHEMA },
      })
      expectTypeOf<InjectByApiContractParams<typeof postContract>>().toEqualTypeOf<{
        pathParams: { userId: string }
        body: { id: string }
        queryParams?: undefined
        headers?: undefined
        pathPrefix?: string
      }>()

      const getContract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: REQUEST_QUERY_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })
      expectTypeOf<
        InjectByApiContractParams<typeof getContract>['body']
      >().toEqualTypeOf<undefined>()
      expectTypeOf<InjectByApiContractParams<typeof getContract>['queryParams']>().toEqualTypeOf<
        z.input<typeof REQUEST_QUERY_SCHEMA>
      >()
    })

    it('produces an all-optional params type for a contract without request schemas', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/ping',
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })
      expectTypeOf<InjectByApiContractParams<typeof contract>>().toEqualTypeOf<{
        pathParams?: undefined
        body?: undefined
        queryParams?: undefined
        headers?: undefined
        pathPrefix?: string
      }>()
    })

    it('always exposes an optional pathPrefix', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/ping',
        responsesByStatusCode: { 200: RESPONSE_BODY_SCHEMA },
      })
      expectTypeOf<InjectByApiContractParams<typeof contract>['pathPrefix']>().toEqualTypeOf<
        string | undefined
      >()
    })
  })
})
