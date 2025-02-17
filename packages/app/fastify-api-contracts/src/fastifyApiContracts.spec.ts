import { buildGetRoute } from '@lokalise/universal-ts-utils/node'
import { type RouteOptions, fastify } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { describe, expect } from 'vitest'
import { z } from 'zod'
import { buildFastifyGetRoute, buildFastifyGetRouteHandler } from './fastifyApiContracts'
import { injectGet } from './fastifyApiRequestInjector'

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
  describe('buildFastifyGetRouteHandler', () => {
    it('builds a handler', () => {
      const contract = buildGetRoute({
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const handler = buildFastifyGetRouteHandler(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        return Promise.resolve()
      })
      expect(handler).toBeTypeOf('function')
    })
  })
  describe('buildFastifyGetRoute', () => {
    it('uses API spec to build valid GET route in fastify app', async () => {
      expect.assertions(2)
      const contract = buildGetRoute({
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const route = buildFastifyGetRoute(contract, (req) => {
        expect(req.params.userId).toEqual('1')
        return Promise.resolve()
      })

      const app = await initApp(route)
      const response = await injectGet(app, contract, {
        pathParams: { userId: '1' },
      })

      expect(response.statusCode).toBe(200)
    })
  })
})
