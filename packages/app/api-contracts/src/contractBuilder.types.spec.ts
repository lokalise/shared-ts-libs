import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type { GetRouteDefinition } from './apiContracts.ts'
import { buildContract } from './contractBuilder.ts'
import type { DualModeContractDefinition } from './sse/dualModeContracts.ts'
import type { SSEContractDefinition } from './sse/sseContracts.ts'

describe('buildContract type inference', () => {
  // ============================================================================
  // REST Contract Types
  // ============================================================================

  describe('REST GET route types', () => {
    it('returns GetRouteDefinition for GET routes', () => {
      const contract = buildContract({
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      expectTypeOf(contract).toMatchTypeOf<GetRouteDefinition<z.ZodObject<{ id: z.ZodString }>>>()
      expectTypeOf(contract.method).toEqualTypeOf<'get'>()
    })

    it('infers path params type from schema', () => {
      const pathParamsSchema = z.object({
        userId: z.string(),
        orgId: z.number(),
      })

      const contract = buildContract({
        successResponseBodySchema: z.object({ id: z.string() }),
        requestPathParamsSchema: pathParamsSchema,
        pathResolver: (params) => `/orgs/${params.orgId}/users/${params.userId}`,
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof pathParamsSchema | undefined
      >()
    })

    it('infers query params type from schema', () => {
      const querySchema = z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
      })

      const contract = buildContract({
        successResponseBodySchema: z.object({ items: z.array(z.string()) }),
        requestQuerySchema: querySchema,
        pathResolver: () => '/api/items',
      })

      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
    })

    it('infers response body type from schema', () => {
      const responseSchema = z.object({
        users: z.array(z.object({ id: z.string(), name: z.string() })),
        total: z.number(),
      })

      const contract = buildContract({
        successResponseBodySchema: responseSchema,
        pathResolver: () => '/api/users',
      })

      expectTypeOf(contract.successResponseBodySchema).toEqualTypeOf(responseSchema)
    })

    it('infers request header type from schema', () => {
      const headerSchema = z.object({
        authorization: z.string(),
        'x-api-key': z.string(),
      })

      const contract = buildContract({
        successResponseBodySchema: z.object({}),
        requestHeaderSchema: headerSchema,
        pathResolver: () => '/api/protected',
      })

      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headerSchema | undefined>()
    })

    it('infers response header type from schema', () => {
      const responseHeaderSchema = z.object({
        'x-ratelimit-limit': z.string(),
        'x-ratelimit-remaining': z.string(),
      })

      const contract = buildContract({
        successResponseBodySchema: z.object({}),
        responseHeaderSchema: responseHeaderSchema,
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.responseHeaderSchema).toEqualTypeOf<
        typeof responseHeaderSchema | undefined
      >()
    })
  })

  describe('REST DELETE route types', () => {
    it('returns DeleteRouteDefinition for DELETE routes', () => {
      const contract = buildContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/users/123',
      })

      expectTypeOf(contract.method).toEqualTypeOf<'delete'>()
      expectTypeOf(contract).toHaveProperty('method')
      expectTypeOf(contract).toHaveProperty('pathResolver')
      expectTypeOf(contract).toHaveProperty('successResponseBodySchema')
    })

    it('infers path params for DELETE routes', () => {
      const pathParamsSchema = z.object({ userId: z.string() })

      const contract = buildContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        requestPathParamsSchema: pathParamsSchema,
        pathResolver: (params) => `/api/users/${params.userId}`,
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof pathParamsSchema | undefined
      >()
    })

    it('defaults isEmptyResponseExpected to true type', () => {
      const contract = buildContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/resource',
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true | undefined>()
    })
  })

  describe('REST Payload route types (POST/PUT/PATCH)', () => {
    it('returns PayloadRouteDefinition for POST routes', () => {
      const bodySchema = z.object({ name: z.string() })
      const responseSchema = z.object({ id: z.string() })

      const contract = buildContract({
        method: 'post',
        requestBodySchema: bodySchema,
        successResponseBodySchema: responseSchema,
        pathResolver: () => '/api/users',
      })

      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('returns PayloadRouteDefinition for PUT routes', () => {
      const bodySchema = z.object({ name: z.string() })

      const contract = buildContract({
        method: 'put',
        requestBodySchema: bodySchema,
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users/123',
      })

      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('returns PayloadRouteDefinition for PATCH routes', () => {
      const bodySchema = z.object({ name: z.string().optional() })

      const contract = buildContract({
        method: 'patch',
        requestBodySchema: bodySchema,
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users/123',
      })

      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('infers request body type from schema', () => {
      const requestBodySchema = z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number().optional(),
      })

      const contract = buildContract({
        method: 'post',
        requestBodySchema,
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(requestBodySchema)
    })

    it('infers response body type from schema', () => {
      const responseSchema = z.object({
        id: z.string(),
        createdAt: z.string(),
      })

      const contract = buildContract({
        method: 'post',
        requestBodySchema: z.object({ data: z.string() }),
        successResponseBodySchema: responseSchema,
        pathResolver: () => '/api/items',
      })

      expectTypeOf(contract.successResponseBodySchema).toEqualTypeOf(responseSchema)
    })
  })

  describe('REST responseSchemasByStatusCode types', () => {
    it('infers status code response types', () => {
      const contract = buildContract({
        successResponseBodySchema: z.object({ data: z.string() }),
        pathResolver: () => '/api/data',
        responseSchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
          404: z.object({ error: z.literal('Not found') }),
          500: z.object({ error: z.string(), stack: z.string().optional() }),
        },
      })

      expectTypeOf(contract.responseSchemasByStatusCode).not.toBeUndefined()
    })
  })

  describe('REST pathResolver type safety', () => {
    it('enforces correct path params in pathResolver', () => {
      const pathParamsSchema = z.object({
        userId: z.string(),
        projectId: z.number(),
      })

      buildContract({
        successResponseBodySchema: z.object({}),
        requestPathParamsSchema: pathParamsSchema,
        pathResolver: (params) => {
          const path = `/users/${params.userId}/projects/${params.projectId}`
          return path
        },
      })
    })

    it('allows empty params when no path params schema', () => {
      buildContract({
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/users',
      })
    })
  })

  describe('REST boolean flag types', () => {
    describe('isEmptyResponseExpected', () => {
      it('defaults to false type for GET routes', () => {
        const contract = buildContract({
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('defaults to false type for POST routes', () => {
        const contract = buildContract({
          method: 'post',
          requestBodySchema: z.object({}),
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('defaults to true type for DELETE routes', () => {
        const contract = buildContract({
          method: 'delete',
          successResponseBodySchema: z.undefined(),
          pathResolver: () => '/api/resource',
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true | undefined>()
      })

      it('reflects explicit true value in type for GET', () => {
        const contract = buildContract({
          successResponseBodySchema: z.undefined(),
          pathResolver: () => '/api/void',
          isEmptyResponseExpected: true,
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true | undefined>()
      })

      it('reflects explicit false value in type for DELETE', () => {
        const contract = buildContract({
          method: 'delete',
          successResponseBodySchema: z.object({ deleted: z.boolean() }),
          pathResolver: () => '/api/resource',
          isEmptyResponseExpected: false,
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
      })
    })

    describe('isNonJSONResponseExpected', () => {
      it('defaults to false type for GET routes', () => {
        const contract = buildContract({
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('defaults to false type for POST routes', () => {
        const contract = buildContract({
          method: 'post',
          requestBodySchema: z.object({}),
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('defaults to false type for DELETE routes', () => {
        const contract = buildContract({
          method: 'delete',
          successResponseBodySchema: z.undefined(),
          pathResolver: () => '/api/resource',
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('reflects explicit true value in type', () => {
        const contract = buildContract({
          successResponseBodySchema: z.string(),
          pathResolver: () => '/api/file',
          isNonJSONResponseExpected: true,
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<true | undefined>()
      })
    })
  })

  // ============================================================================
  // SSE Contract Types
  // ============================================================================

  describe('SSE GET route types', () => {
    it('returns SSEContractDefinition for SSE GET routes', () => {
      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract).toMatchTypeOf<SSEContractDefinition<'get'>>()
      expectTypeOf(contract.method).toEqualTypeOf<'get'>()
      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
    })

    it('infers params type from schema', () => {
      const paramsSchema = z.object({ channelId: z.string() })

      const contract = buildContract({
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        params: paramsSchema,
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.params).toEqualTypeOf(paramsSchema)
    })

    it('infers query type from schema', () => {
      const querySchema = z.object({ userId: z.string().optional() })

      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: querySchema,
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.query).toEqualTypeOf(querySchema)
    })

    it('infers requestHeaders type from schema', () => {
      const headersSchema = z.object({ authorization: z.string() })

      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: headersSchema,
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.requestHeaders).toEqualTypeOf(headersSchema)
    })

    it('infers sseEvents types', () => {
      const events = {
        chunk: z.object({ content: z.string() }),
        done: z.object({ totalTokens: z.number() }),
      }

      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: events,
      })

      expectTypeOf(contract.sseEvents).toEqualTypeOf(events)
    })

    it('has undefined requestBody for GET routes', () => {
      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.requestBody).toEqualTypeOf<undefined>()
    })
  })

  describe('SSE POST route types', () => {
    it('returns SSEContractDefinition for SSE POST routes', () => {
      const contract = buildContract({
        pathResolver: () => '/api/process',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: z.object({ data: z.string() }),
        sseEvents: {
          progress: z.object({ percent: z.number() }),
        },
      })

      // Verify key properties that identify this as an SSE contract
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
      expectTypeOf(contract).toHaveProperty('sseEvents')
      expectTypeOf(contract).toHaveProperty('requestBody')
    })

    it('infers requestBody type from schema', () => {
      const bodySchema = z.object({ message: z.string(), count: z.number() })

      const contract = buildContract({
        pathResolver: () => '/api/process',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: bodySchema,
        sseEvents: {
          progress: z.object({ percent: z.number() }),
        },
      })

      expectTypeOf(contract.requestBody).toEqualTypeOf(bodySchema)
    })

    it('allows explicit method specification', () => {
      const contract = buildContract({
        method: 'put',
        pathResolver: () => '/api/process',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: z.object({ data: z.string() }),
        sseEvents: {
          progress: z.object({ percent: z.number() }),
        },
      })

      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
    })
  })

  describe('SSE responseSchemasByStatusCode types', () => {
    it('infers status code response types for SSE routes', () => {
      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
        responseSchemasByStatusCode: {
          401: z.object({ error: z.literal('Unauthorized') }),
          404: z.object({ error: z.literal('Not found') }),
        },
      })

      expectTypeOf(contract.responseSchemasByStatusCode).not.toBeUndefined()
    })
  })

  // ============================================================================
  // Dual-mode Contract Types
  // ============================================================================

  describe('Dual-mode GET route types', () => {
    it('returns DualModeContractDefinition for dual-mode GET routes', () => {
      const contract = buildContract({
        pathResolver: () => '/api/status',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        syncResponseBody: z.object({ status: z.string() }),
        sseEvents: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract).toMatchTypeOf<DualModeContractDefinition<'get'>>()
      expectTypeOf(contract.method).toEqualTypeOf<'get'>()
      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
    })

    it('infers syncResponseBody type from schema', () => {
      const syncResponseSchema = z.object({
        status: z.enum(['pending', 'running', 'completed']),
        progress: z.number(),
      })

      const contract = buildContract({
        pathResolver: () => '/api/status',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        syncResponseBody: syncResponseSchema,
        sseEvents: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.syncResponseBody).toEqualTypeOf(syncResponseSchema)
    })

    it('infers responseHeaders type from schema', () => {
      const responseHeadersSchema = z.object({
        'x-ratelimit-limit': z.string(),
        'x-ratelimit-remaining': z.string(),
      })

      const contract = buildContract({
        pathResolver: () => '/api/status',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        syncResponseBody: z.object({ status: z.string() }),
        responseHeaders: responseHeadersSchema,
        sseEvents: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.responseHeaders).toEqualTypeOf<
        typeof responseHeadersSchema | undefined
      >()
    })

    it('has undefined requestBody for GET routes', () => {
      const contract = buildContract({
        pathResolver: () => '/api/status',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        syncResponseBody: z.object({ status: z.string() }),
        sseEvents: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.requestBody).toEqualTypeOf<undefined>()
    })
  })

  describe('Dual-mode POST route types', () => {
    it('returns DualModeContractDefinition for dual-mode POST routes', () => {
      const contract = buildContract({
        pathResolver: () => '/api/chat/completions',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: z.object({ message: z.string() }),
        syncResponseBody: z.object({ reply: z.string() }),
        sseEvents: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      // Verify key properties that identify this as a dual-mode contract
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf(contract).toHaveProperty('syncResponseBody')
      expectTypeOf(contract).toHaveProperty('sseEvents')
      expectTypeOf(contract).toHaveProperty('requestBody')
    })

    it('infers requestBody type from schema', () => {
      const bodySchema = z.object({
        message: z.string(),
        model: z.string().optional(),
      })

      const contract = buildContract({
        pathResolver: () => '/api/chat/completions',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: bodySchema,
        syncResponseBody: z.object({ reply: z.string() }),
        sseEvents: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expectTypeOf(contract.requestBody).toEqualTypeOf(bodySchema)
    })

    it('infers syncResponseBody type from schema', () => {
      const syncResponseSchema = z.object({
        reply: z.string(),
        usage: z.object({ tokens: z.number() }),
      })

      const contract = buildContract({
        pathResolver: () => '/api/chat/completions',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: z.object({ message: z.string() }),
        syncResponseBody: syncResponseSchema,
        sseEvents: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expectTypeOf(contract.syncResponseBody).toEqualTypeOf(syncResponseSchema)
    })

    it('allows explicit method specification', () => {
      const contract = buildContract({
        method: 'put',
        pathResolver: () => '/api/chat/completions',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: z.object({ message: z.string() }),
        syncResponseBody: z.object({ reply: z.string() }),
        sseEvents: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
    })
  })

  describe('Dual-mode responseSchemasByStatusCode types', () => {
    it('infers status code response types for dual-mode routes', () => {
      const contract = buildContract({
        pathResolver: () => '/api/chat/completions',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: z.object({ message: z.string() }),
        syncResponseBody: z.object({ reply: z.string() }),
        sseEvents: {
          chunk: z.object({ delta: z.string() }),
        },
        responseSchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
          401: z.object({ error: z.literal('Unauthorized') }),
        },
      })

      expectTypeOf(contract.responseSchemasByStatusCode).not.toBeUndefined()
    })
  })

  // ============================================================================
  // Cross-cutting Type Discrimination Tests
  // ============================================================================

  describe('contract type discrimination', () => {
    it('REST contracts do not have isSSE property', () => {
      const contract = buildContract({
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      // REST contracts should not have isSSE
      expectTypeOf(contract).not.toHaveProperty('isSSE')
    })

    it('REST contracts do not have isDualMode property', () => {
      const contract = buildContract({
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      // REST contracts should not have isDualMode
      expectTypeOf(contract).not.toHaveProperty('isDualMode')
    })

    it('SSE contracts have isSSE: true', () => {
      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
    })

    it('SSE contracts do not have isDualMode property', () => {
      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      // SSE contracts should not have isDualMode
      expectTypeOf(contract).not.toHaveProperty('isDualMode')
    })

    it('Dual-mode contracts have isDualMode: true', () => {
      const contract = buildContract({
        pathResolver: () => '/api/status',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        syncResponseBody: z.object({ status: z.string() }),
        sseEvents: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
    })

    it('Dual-mode contracts do not have isSSE property', () => {
      const contract = buildContract({
        pathResolver: () => '/api/status',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        syncResponseBody: z.object({ status: z.string() }),
        sseEvents: {
          update: z.object({ progress: z.number() }),
        },
      })

      // Dual-mode contracts should not have isSSE
      expectTypeOf(contract).not.toHaveProperty('isSSE')
    })
  })

  // ============================================================================
  // pathResolver Type Safety
  // ============================================================================

  describe('pathResolver type safety across contract types', () => {
    it('enforces correct params for REST routes', () => {
      const pathParamsSchema = z.object({ userId: z.string() })

      buildContract({
        successResponseBodySchema: z.object({}),
        requestPathParamsSchema: pathParamsSchema,
        pathResolver: (params) => `/api/users/${params.userId}`,
      })
    })

    it('enforces correct params for SSE routes', () => {
      const paramsSchema = z.object({ channelId: z.string() })

      buildContract({
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        params: paramsSchema,
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })
    })

    it('enforces correct params for dual-mode routes', () => {
      const paramsSchema = z.object({ jobId: z.string() })

      buildContract({
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        params: paramsSchema,
        query: z.object({}),
        requestHeaders: z.object({}),
        syncResponseBody: z.object({ status: z.string() }),
        sseEvents: {
          update: z.object({ progress: z.number() }),
        },
      })
    })
  })
})
