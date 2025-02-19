import {
  buildDeleteRoute,
  buildGetRoute,
  buildPayloadRoute,
} from '@lokalise/universal-ts-utils/node'
import { type RouteOptions, fastify } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  buildFastifyNoPayloadRoute,
  buildFastifyNoPayloadRouteHandler,
  buildFastifyPayloadRoute,
  buildFastifyPayloadRouteHandler,
} from './fastifyApiContracts'
import {
  injectDelete,
  injectGet,
  injectPatch,
  injectPost,
  injectPut,
} from './fastifyApiRequestInjector'

const REQUEST_BODY_SCHEMA = z.object({
  id: z.string(),
})
const BODY_SCHEMA = z.object({})
const PATH_PARAMS_SCHEMA = z.object({
  userId: z.string(),
})
const _PATH_PARAMS_MULTI_SCHEMA = z.object({
  userId: z.string(),
  orgId: z.string(),
})

async function initApp(route: RouteOptions) {
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
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyNoPayloadRouteHandler(contract, () => Promise.resolve())
      expect(handler).toBeTypeOf('function')
    })
  })
  describe('buildFastifyNoPayloadRoute', () => {
    it('uses API spec to build valid GET route in fastify app', async () => {
      expect.assertions(2)
      const contract = buildGetRoute({
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyNoPayloadRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectGet(app, contract, {
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('uses API spec to build valid DELETE route in fastify app', async () => {
      expect.assertions(2)
      const contract = buildDeleteRoute({
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyNoPayloadRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectDelete(app, contract, {
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('buildFastifyPayloadRouteHandler', () => {
    it('builds a POST handler', () => {
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        responseBodySchema: BODY_SCHEMA,
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
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyPayloadRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        expect(req.body.id).toEqual('2')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectPost(app, contract, {
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
        responseBodySchema: BODY_SCHEMA,
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

    it('uses API spec to build valid PUT route in fastify app', async () => {
      expect.assertions(3)
      const contract = buildPayloadRoute({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        responseBodySchema: BODY_SCHEMA,
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
  })
})
