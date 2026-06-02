import {
  anyOfResponses,
  blobResponse,
  ContractNoBody,
  defineApiContract,
  textResponse,
} from '@lokalise/api-contracts'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { buildFastifyApiRoute, buildFastifyApiRouteHandler } from './buildFastifyApiRoute.ts'
import type { RouteType } from './types.ts'

describe('buildFastifyApiRouteHandler type inference', () => {
  describe('GET route handler types', () => {
    it('accepts GET contract and returns a no-payload handler', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/api/users',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })

      const handler = buildFastifyApiRouteHandler(contract, () => Promise.resolve({ id: '1' }))

      expectTypeOf(handler).toBeFunction()
    })

    it('infers path params in a GET handler', () => {
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: (params) => `/users/${params.userId}`,
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })

      buildFastifyApiRouteHandler(contract, (req) => {
        expectTypeOf(req.params).toEqualTypeOf<{ userId: string }>()
        return Promise.resolve({ id: '1' })
      })
    })

    it('infers query params in a GET handler', () => {
      const contract = defineApiContract({
        method: 'get',
        requestQuerySchema: z.object({ limit: z.number() }),
        pathResolver: () => '/api/items',
        responsesByStatusCode: { 200: z.object({}) },
      })

      buildFastifyApiRouteHandler(contract, (req) => {
        expectTypeOf(req.query).toEqualTypeOf<{ limit: number }>()
        return Promise.resolve({})
      })
    })

    it('infers headers in a GET handler', () => {
      const contract = defineApiContract({
        method: 'get',
        requestHeaderSchema: z.object({ authorization: z.string() }),
        pathResolver: () => '/api/protected',
        responsesByStatusCode: { 200: z.object({}) },
      })

      buildFastifyApiRouteHandler(contract, (req) => {
        // Fastify merges custom headers with its own IncomingHttpHeaders type
        expectTypeOf(req.headers).toHaveProperty('authorization')
        return Promise.resolve({})
      })
    })
  })

  describe('DELETE route handler types', () => {
    it('accepts DELETE contract and returns a no-payload handler', () => {
      const contract = defineApiContract({
        method: 'delete',
        pathResolver: () => '/api/users/123',
        responsesByStatusCode: { 204: ContractNoBody },
      })

      const handler = buildFastifyApiRouteHandler(contract, () => Promise.resolve(undefined))

      expectTypeOf(handler).toBeFunction()
    })

    it('infers path params in a DELETE handler', () => {
      const contract = defineApiContract({
        method: 'delete',
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: (params) => `/users/${params.userId}`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      buildFastifyApiRouteHandler(contract, (req) => {
        expectTypeOf(req.params).toEqualTypeOf<{ userId: string }>()
        return Promise.resolve(undefined)
      })
    })
  })

  describe('payload route handler types (POST/PUT/PATCH)', () => {
    it('infers body type in a POST handler', () => {
      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: z.object({ name: z.string() }),
        pathResolver: () => '/api/users',
        responsesByStatusCode: { 201: z.object({ id: z.string() }) },
      })

      const handler = buildFastifyApiRouteHandler(contract, (req) => {
        expectTypeOf(req.body).toEqualTypeOf<{ name: string }>()
        return Promise.resolve({ id: '1' })
      })

      expectTypeOf(handler).toBeFunction()
    })

    it('infers body type in a PUT handler', () => {
      const contract = defineApiContract({
        method: 'put',
        requestBodySchema: z.object({ name: z.string(), age: z.number() }),
        pathResolver: () => '/api/users/123',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })

      buildFastifyApiRouteHandler(contract, (req) => {
        expectTypeOf(req.body).toEqualTypeOf<{ name: string; age: number }>()
        return Promise.resolve({ id: '1' })
      })
    })

    it('infers an optional body field in a PATCH handler', () => {
      const contract = defineApiContract({
        method: 'patch',
        requestBodySchema: z.object({ name: z.string().optional() }),
        pathResolver: () => '/api/users/123',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })

      buildFastifyApiRouteHandler(contract, (req) => {
        expectTypeOf(req.body).toEqualTypeOf<{ name?: string | undefined }>()
        return Promise.resolve({ id: '1' })
      })
    })

    it('types req.body as undefined for a ContractNoBody payload', () => {
      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: ContractNoBody,
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: (params) => `/users/${params.userId}/activate`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      buildFastifyApiRouteHandler(contract, (req) => {
        // The route-level Body generic is `undefined` (see the route-type test below); Fastify
        // surfaces that absent body as `unknown` on `req.body` at the handler level.
        expectTypeOf(req.body).toEqualTypeOf<unknown>()
        expectTypeOf(req.params).toEqualTypeOf<{ userId: string }>()
        return Promise.resolve(undefined)
      })
    })
  })
})

describe('buildFastifyApiRoute type inference', () => {
  describe('GET route types', () => {
    it('returns the correct RouteType for a GET route', () => {
      const RESPONSE_SCHEMA = z.object({ name: z.string() })
      const PATH_PARAMS_SCHEMA = z.object({ userId: z.string() })
      const QUERY_SCHEMA = z.object({ limit: z.number() })

      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        requestQuerySchema: QUERY_SCHEMA,
        pathResolver: (params) => `/users/${params.userId}`,
        responsesByStatusCode: { 200: RESPONSE_SCHEMA },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ name: 'Frodo' }))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof RESPONSE_SCHEMA>,
          undefined,
          z.infer<typeof PATH_PARAMS_SCHEMA>,
          z.infer<typeof QUERY_SCHEMA>,
          undefined
        >
      >()
    })

    it('infers headers in a GET route type', () => {
      const RESPONSE_SCHEMA = z.object({ name: z.string() })
      const HEADERS_SCHEMA = z.object({ authorization: z.string() })

      const contract = defineApiContract({
        method: 'get',
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: () => '/api/test',
        responsesByStatusCode: { 200: RESPONSE_SCHEMA },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ name: 'Frodo' }))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<
          z.infer<typeof RESPONSE_SCHEMA>,
          undefined,
          undefined,
          undefined,
          z.infer<typeof HEADERS_SCHEMA>
        >
      >()
    })
  })

  describe('DELETE route types', () => {
    it('returns a RouteType with undefined body and reply for a ContractNoBody DELETE', () => {
      const PATH_PARAMS_SCHEMA = z.object({ userId: z.string() })

      const contract = defineApiContract({
        method: 'delete',
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (params) => `/users/${params.userId}`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve(undefined))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<undefined, undefined, z.infer<typeof PATH_PARAMS_SCHEMA>, undefined, undefined>
      >()
    })
  })

  describe('payload route types (POST/PUT/PATCH)', () => {
    it('returns the correct RouteType for a POST route', () => {
      const REQUEST_BODY_SCHEMA = z.object({ name: z.string() })
      const RESPONSE_SCHEMA = z.object({ id: z.string() })
      const PATH_PARAMS_SCHEMA = z.object({ orgId: z.string() })

      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (params) => `/orgs/${params.orgId}/users`,
        responsesByStatusCode: { 201: RESPONSE_SCHEMA },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ id: '1' }))

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

    it('returns the correct RouteType for a PUT route', () => {
      const REQUEST_BODY_SCHEMA = z.object({ name: z.string() })
      const RESPONSE_SCHEMA = z.object({ id: z.string() })

      const contract = defineApiContract({
        method: 'put',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        pathResolver: () => '/api/users/123',
        responsesByStatusCode: { 200: RESPONSE_SCHEMA },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ id: '1' }))

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

    it('returns the correct RouteType for a PATCH route', () => {
      const REQUEST_BODY_SCHEMA = z.object({ name: z.string().optional() })
      const RESPONSE_SCHEMA = z.object({ id: z.string() })

      const contract = defineApiContract({
        method: 'patch',
        requestBodySchema: REQUEST_BODY_SCHEMA,
        pathResolver: () => '/api/users/123',
        responsesByStatusCode: { 200: RESPONSE_SCHEMA },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ id: '1' }))

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

    it('types the body as undefined for a ContractNoBody payload route', () => {
      const PATH_PARAMS_SCHEMA = z.object({ userId: z.string() })

      const contract = defineApiContract({
        method: 'post',
        requestBodySchema: ContractNoBody,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (params) => `/users/${params.userId}/activate`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve(undefined))

      expectTypeOf(route).toEqualTypeOf<
        RouteType<undefined, undefined, z.infer<typeof PATH_PARAMS_SCHEMA>, undefined, undefined>
      >()
    })
  })

  describe('reply type inference from responsesByStatusCode', () => {
    it('infers the reply from a single JSON success response', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/profile',
        responsesByStatusCode: { 200: z.object({ name: z.string() }) },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ name: 'Frodo' }))

      expectTypeOf(route).toMatchTypeOf<RouteType<{ name: string }>>()
    })

    it('infers the reply from success responses only, ignoring error status codes', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/profile',
        responsesByStatusCode: {
          200: z.object({ name: z.string() }),
          400: z.object({ error: z.string() }),
        },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ name: 'Frodo' }))

      // The 400 (error) schema does not widen the reply type
      expectTypeOf(route).toMatchTypeOf<RouteType<{ name: string }>>()
    })

    it('unions the reply across multiple success status codes', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/multi',
        responsesByStatusCode: {
          200: z.object({ a: z.string() }),
          201: z.object({ b: z.number() }),
        },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ a: 'x' }))

      expectTypeOf(route).toMatchTypeOf<RouteType<{ a: string } | { b: number }>>()
    })

    it('unions the JSON members of an anyOfResponses success entry', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/any',
        responsesByStatusCode: {
          200: anyOfResponses([z.object({ a: z.string() }), z.object({ b: z.number() })]),
        },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve({ a: 'x' }))

      expectTypeOf(route).toMatchTypeOf<RouteType<{ a: string } | { b: number }>>()
    })

    it('infers a string reply for a textResponse success entry', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/export',
        responsesByStatusCode: { 200: textResponse('text/csv') },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve('a,b,c'))

      expectTypeOf(route).toMatchTypeOf<RouteType<string>>()
    })

    it('infers a Blob reply for a blobResponse success entry', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/download',
        responsesByStatusCode: { 200: blobResponse('application/octet-stream') },
      })

      const route = buildFastifyApiRoute(contract, () => Promise.resolve(new Blob([])))

      expectTypeOf(route).toMatchTypeOf<RouteType<Blob>>()
    })
  })
})
