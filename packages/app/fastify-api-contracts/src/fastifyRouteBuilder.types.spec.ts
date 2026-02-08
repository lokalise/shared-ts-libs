import { buildRestContract } from '@lokalise/api-contracts'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { buildFastifyRoute, buildFastifyRouteHandler } from './fastifyRouteBuilder.ts'
import type { RouteType } from './types.ts'

describe('buildFastifyRouteHandler type inference', () => {
  describe('GET route handler types', () => {
    it('accepts GET contract and returns no-payload handler', () => {
      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      const handler = buildFastifyRouteHandler(contract, async (_req, reply) => {
        await reply.send({ id: '1' })
      })

      expectTypeOf(handler).toBeFunction()
    })

    it('infers path params in GET handler', () => {
      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: z.object({ id: z.string() }),
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: (params) => `/users/${params.userId}`,
      })

      buildFastifyRouteHandler(contract, (req) => {
        expectTypeOf(req.params).toEqualTypeOf<{ userId: string }>()
      })
    })

    it('infers query params in GET handler', () => {
      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: z.object({}),
        requestQuerySchema: z.object({ limit: z.number() }),
        pathResolver: () => '/api/items',
      })

      buildFastifyRouteHandler(contract, (req) => {
        expectTypeOf(req.query).toEqualTypeOf<{ limit: number }>()
      })
    })

    it('infers headers in GET handler', () => {
      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: z.object({}),
        requestHeaderSchema: z.object({ authorization: z.string() }),
        pathResolver: () => '/api/protected',
      })

      buildFastifyRouteHandler(contract, (req) => {
        // Fastify merges custom headers with its own IncomingHttpHeaders type
        expectTypeOf(req.headers).toHaveProperty('authorization')
      })
    })
  })

  describe('DELETE route handler types', () => {
    it('accepts DELETE contract and returns no-payload handler', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/users/123',
      })

      const handler = buildFastifyRouteHandler(contract, async () => {})

      expectTypeOf(handler).toBeFunction()
    })

    it('infers path params in DELETE handler', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: (params) => `/users/${params.userId}`,
      })

      buildFastifyRouteHandler(contract, (req) => {
        expectTypeOf(req.params).toEqualTypeOf<{ userId: string }>()
      })
    })

    it('accepts DELETE contract with path params and headers', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        requestPathParamsSchema: z.object({ id: z.string() }),
        requestHeaderSchema: z.object({ authorization: z.string() }),
        pathResolver: (params) => `/api/items/${params.id}`,
      })

      const handler = buildFastifyRouteHandler(contract, (req) => {
        expectTypeOf(req.params).toEqualTypeOf<{ id: string }>()
      })

      expectTypeOf(handler).toBeFunction()
    })
  })

  describe('Payload route handler types (POST/PUT/PATCH)', () => {
    it('accepts POST contract and returns payload handler', () => {
      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: z.object({ name: z.string() }),
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      const handler = buildFastifyRouteHandler(contract, async (req, reply) => {
        expectTypeOf(req.body).toEqualTypeOf<{ name: string }>()
        await reply.send({ id: '1' })
      })

      expectTypeOf(handler).toBeFunction()
    })

    it('infers body type in PUT handler', () => {
      const contract = buildRestContract({
        method: 'put',
        requestBodySchema: z.object({ name: z.string(), age: z.number() }),
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users/123',
      })

      buildFastifyRouteHandler(contract, (req) => {
        expectTypeOf(req.body).toEqualTypeOf<{ name: string; age: number }>()
      })
    })

    it('infers body type in PATCH handler', () => {
      const contract = buildRestContract({
        method: 'patch',
        requestBodySchema: z.object({ name: z.string().optional() }),
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users/123',
      })

      buildFastifyRouteHandler(contract, (req) => {
        expectTypeOf(req.body).toEqualTypeOf<{ name?: string | undefined }>()
      })
    })

    it('infers path params in POST handler', () => {
      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: z.object({ name: z.string() }),
        successResponseBodySchema: z.object({ id: z.string() }),
        requestPathParamsSchema: z.object({ orgId: z.string() }),
        pathResolver: (params) => `/orgs/${params.orgId}/users`,
      })

      buildFastifyRouteHandler(contract, (req) => {
        expectTypeOf(req.params).toEqualTypeOf<{ orgId: string }>()
      })
    })
  })
})

describe('buildFastifyRoute type inference', () => {
  describe('GET route types', () => {
    it('returns correct RouteType for GET routes', () => {
      const BODY_SCHEMA = z.object({})
      const PATH_PARAMS_SCHEMA = z.object({ userId: z.string() })
      const QUERY_SCHEMA = z.object({ limit: z.number() })

      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: QUERY_SCHEMA,
        pathResolver: (params) => `/users/${params.userId}`,
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve({}))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          z.infer<typeof QUERY_SCHEMA>,
          undefined
        >
      >()
    })

    it('returns RouteType with undefined body for GET routes', () => {
      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve({ id: '1' }))

      // Body type parameter should be undefined for GET routes
      expectTypeOf(route).toMatchTypeOf<RouteType<{ id: string }, undefined>>()
    })

    it('infers headers in GET route type', () => {
      const BODY_SCHEMA = z.object({})
      const HEADERS_SCHEMA = z.object({ authorization: z.string() })

      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: BODY_SCHEMA,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: () => '/api/test',
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve({}))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          undefined,
          undefined,
          undefined,
          z.infer<typeof HEADERS_SCHEMA>
        >
      >()
    })
  })

  describe('DELETE route types', () => {
    it('returns correct RouteType for DELETE routes', () => {
      const BODY_SCHEMA = z.object({})
      const PATH_PARAMS_SCHEMA = z.object({ userId: z.string() })

      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (params) => `/users/${params.userId}`,
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve())

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof BODY_SCHEMA>,
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          undefined,
          undefined
        >
      >()
    })

    it('returns RouteType with undefined body for DELETE routes', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/users/123',
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve())

      expectTypeOf(route).toMatchTypeOf<RouteType<undefined, undefined>>()
    })
  })

  describe('Payload route types (POST/PUT/PATCH)', () => {
    it('returns correct RouteType for POST routes with body', () => {
      const REQUEST_BODY_SCHEMA = z.object({ name: z.string() })
      const RESPONSE_SCHEMA = z.object({ id: z.string() })
      const PATH_PARAMS_SCHEMA = z.object({ orgId: z.string() })

      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: RESPONSE_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (params) => `/orgs/${params.orgId}/users`,
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve({ id: '1' }))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof RESPONSE_SCHEMA>,
          z.infer<typeof REQUEST_BODY_SCHEMA>,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          undefined,
          undefined
        >
      >()
    })

    it('returns correct RouteType for PUT routes', () => {
      const REQUEST_BODY_SCHEMA = z.object({ name: z.string() })
      const RESPONSE_SCHEMA = z.object({ id: z.string() })

      const contract = buildRestContract({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: RESPONSE_SCHEMA,
        pathResolver: () => '/api/users/123',
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve({ id: '1' }))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof RESPONSE_SCHEMA>,
          z.infer<typeof REQUEST_BODY_SCHEMA>,
          undefined,
          undefined,
          undefined
        >
      >()
    })

    it('returns correct RouteType for PATCH routes', () => {
      const REQUEST_BODY_SCHEMA = z.object({ name: z.string().optional() })
      const RESPONSE_SCHEMA = z.object({ id: z.string() })

      const contract = buildRestContract({
        method: 'patch',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: RESPONSE_SCHEMA,
        pathResolver: () => '/api/users/123',
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve({ id: '1' }))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof RESPONSE_SCHEMA>,
          z.infer<typeof REQUEST_BODY_SCHEMA>,
          undefined,
          undefined,
          undefined
        >
      >()
    })

    it('infers request body type in payload route', () => {
      const REQUEST_BODY_SCHEMA = z.object({
        name: z.string(),
        email: z.string(),
        age: z.number().optional(),
      })

      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/users',
      })

      const route = buildFastifyRoute(contract, () => Promise.resolve({}))

      expectTypeOf(route).toMatchTypeOf<
        RouteType<Record<string, never>, { name: string; email: string; age?: number | undefined }>
      >()
    })
  })

  describe('Multiple response schemas', () => {
    it('creates union response type for routes with responseSchemasByStatusCode', () => {
      const SuccessSchema = z.object({ data: z.string() })
      const ErrorSchema = z.object({ error: z.string() })

      const contract = buildRestContract({
        method: 'get',
        successResponseBodySchema: SuccessSchema,
        pathResolver: () => '/api/test',
        responseSchemasByStatusCode: {
          200: SuccessSchema,
          400: ErrorSchema,
        },
      })

      const route = buildFastifyRoute(contract, async (_req, reply) => {
        await reply.send({ data: 'ok' })
      })

      // Route should have union response type
      expectTypeOf(route).toMatchTypeOf<RouteType>()
    })
  })
})
