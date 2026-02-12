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
        method: 'get',
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
        method: 'get',
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
        method: 'get',
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
        method: 'get',
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
        method: 'get',
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
        method: 'get',
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
        method: 'get',
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
        method: 'get',
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
        method: 'get',
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/users',
      })
    })
  })

  describe('REST boolean flag types', () => {
    describe('isEmptyResponseExpected', () => {
      it('defaults to false type for GET routes', () => {
        const contract = buildContract({
          method: 'get',
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
          method: 'get',
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
          method: 'get',
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
          method: 'get',
          successResponseBodySchema: z.string(),
          pathResolver: () => '/api/file',
          isNonJSONResponseExpected: true,
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<true | undefined>()
      })

      it('reflects explicit false value in type', () => {
        const contract = buildContract({
          method: 'get',
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
          isNonJSONResponseExpected: false,
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
      })
    })
  })

  // ============================================================================
  // SSE Contract Types
  // ============================================================================

  describe('SSE GET route types', () => {
    it('returns SSEContractDefinition for SSE GET routes', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
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
        method: 'get',
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
    })

    it('infers query type from schema', () => {
      const querySchema = z.object({ userId: z.string().optional() })

      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: querySchema,
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
    })

    it('infers requestHeaderSchema type from schema', () => {
      const headersSchema = z.object({ authorization: z.string() })

      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: headersSchema,
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<
        typeof headersSchema | undefined
      >()
    })

    it('infers serverSentEventSchemas types', () => {
      const events = {
        chunk: z.object({ content: z.string() }),
        done: z.object({ totalTokens: z.number() }),
      }

      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: events,
      })

      expectTypeOf(contract.serverSentEventSchemas).toEqualTypeOf(events)
    })

    it('has undefined requestBody for GET routes', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.requestBodySchema).toEqualTypeOf<undefined>()
    })

    it('allows omitting requestPathParamsSchema, requestQuerySchema, requestHeaderSchema', () => {
      const contract = buildContract({
        method: 'get' as const,
        pathResolver: () => '/api/stream',
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
      // When omitted, these are optional and accept undefined
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
    })
  })

  describe('SSE POST route types', () => {
    it('returns SSEContractDefinition for SSE POST routes', () => {
      const contract = buildContract({
        method: 'post',
        pathResolver: () => '/api/process',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: {
          progress: z.object({ percent: z.number() }),
        },
      })

      // Verify key properties that identify this as an SSE contract
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
      expectTypeOf(contract).toHaveProperty('serverSentEventSchemas')
      expectTypeOf(contract).toHaveProperty('requestBodySchema')
    })

    it('infers requestBody type from schema', () => {
      const bodySchema = z.object({ message: z.string(), count: z.number() })

      const contract = buildContract({
        method: 'post',
        pathResolver: () => '/api/process',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: bodySchema,
        serverSentEventSchemas: {
          progress: z.object({ percent: z.number() }),
        },
      })

      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('infers params, query, and headers types from schema', () => {
      const paramsSchema = z.object({ projectId: z.string() })
      const querySchema = z.object({ verbose: z.string().optional() })
      const headersSchema = z.object({ authorization: z.string() })

      const contract = buildContract({
        method: 'post',
        pathResolver: (params) => `/api/projects/${params.projectId}/process`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: querySchema,
        requestHeaderSchema: headersSchema,
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: {
          progress: z.object({ percent: z.number() }),
        },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headersSchema | undefined>()
    })

    it('allows omitting requestPathParamsSchema, requestQuerySchema, requestHeaderSchema', () => {
      const contract = buildContract({
        method: 'post' as const,
        pathResolver: () => '/api/process',
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: {
          progress: z.object({ percent: z.number() }),
        },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
      // When omitted, these are optional and accept undefined
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
    })

    it('allows explicit method specification', () => {
      const contract = buildContract({
        method: 'put',
        pathResolver: () => '/api/process',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: {
          progress: z.object({ percent: z.number() }),
        },
      })

      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
    })
  })

  describe('SSE responseBodySchemasByStatusCode types', () => {
    it('infers status code response types for SSE routes', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
        responseBodySchemasByStatusCode: {
          401: z.object({ error: z.literal('Unauthorized') }),
          404: z.object({ error: z.literal('Not found') }),
        },
      })

      expectTypeOf(contract.responseBodySchemasByStatusCode).not.toBeUndefined()
    })
  })

  // ============================================================================
  // Dual-mode Contract Types
  // ============================================================================

  describe('Dual-mode GET route types', () => {
    it('returns DualModeContractDefinition for dual-mode GET routes', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract).toMatchTypeOf<DualModeContractDefinition<'get'>>()
      expectTypeOf(contract.method).toEqualTypeOf<'get'>()
      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
    })

    it('infers successResponseBodySchema type from schema', () => {
      const syncResponseSchema = z.object({
        status: z.enum(['pending', 'running', 'completed']),
        progress: z.number(),
      })

      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: syncResponseSchema,
        serverSentEventSchemas: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.successResponseBodySchema).toEqualTypeOf(syncResponseSchema)
    })

    it('infers responseHeaderSchema type from schema', () => {
      const responseHeadersSchema = z.object({
        'x-ratelimit-limit': z.string(),
        'x-ratelimit-remaining': z.string(),
      })

      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        responseHeaderSchema: responseHeadersSchema,
        serverSentEventSchemas: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.responseHeaderSchema).toEqualTypeOf<
        typeof responseHeadersSchema | undefined
      >()
    })

    it('infers params, query, and headers types from schema', () => {
      const paramsSchema = z.object({ jobId: z.string() })
      const querySchema = z.object({ verbose: z.string().optional() })
      const headersSchema = z.object({ authorization: z.string() })

      const contract = buildContract({
        method: 'get',
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: querySchema,
        requestHeaderSchema: headersSchema,
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headersSchema | undefined>()
    })

    it('allows omitting requestPathParamsSchema, requestQuerySchema, requestHeaderSchema', () => {
      const contract = buildContract({
        method: 'get' as const,
        pathResolver: () => '/api/status',
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
    })

    it('has undefined requestBody for GET routes', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.requestBodySchema).toEqualTypeOf<undefined>()
    })
  })

  describe('Dual-mode POST route types', () => {
    it('returns DualModeContractDefinition for dual-mode POST routes', () => {
      const contract = buildContract({
        method: 'post',
        pathResolver: () => '/api/chat/completions',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      // Verify key properties that identify this as a dual-mode contract
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf(contract).toHaveProperty('successResponseBodySchema')
      expectTypeOf(contract).toHaveProperty('serverSentEventSchemas')
      expectTypeOf(contract).toHaveProperty('requestBodySchema')
    })

    it('infers requestBody type from schema', () => {
      const bodySchema = z.object({
        message: z.string(),
        model: z.string().optional(),
      })

      const contract = buildContract({
        method: 'post',
        pathResolver: () => '/api/chat/completions',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: bodySchema,
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('infers successResponseBodySchema type from schema', () => {
      const syncResponseSchema = z.object({
        reply: z.string(),
        usage: z.object({ tokens: z.number() }),
      })

      const contract = buildContract({
        method: 'post',
        pathResolver: () => '/api/chat/completions',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: syncResponseSchema,
        serverSentEventSchemas: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expectTypeOf(contract.successResponseBodySchema).toEqualTypeOf(syncResponseSchema)
    })

    it('infers params, query, and headers types from schema', () => {
      const paramsSchema = z.object({ chatId: z.string() })
      const querySchema = z.object({ model: z.string().optional() })
      const headersSchema = z.object({ authorization: z.string() })

      const contract = buildContract({
        method: 'post',
        pathResolver: (params) => `/api/chats/${params.chatId}/completions`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: querySchema,
        requestHeaderSchema: headersSchema,
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof paramsSchema | undefined
      >()
      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headersSchema | undefined>()
    })

    it('allows omitting requestPathParamsSchema, requestQuerySchema, requestHeaderSchema', () => {
      const contract = buildContract({
        method: 'post' as const,
        pathResolver: () => '/api/chat/completions',
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestPathParamsSchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestQuerySchema>()
      expectTypeOf<undefined>().toMatchTypeOf<typeof contract.requestHeaderSchema>()
    })

    it('allows explicit method specification', () => {
      const contract = buildContract({
        method: 'put',
        pathResolver: () => '/api/chat/completions',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
    })
  })

  describe('Dual-mode responseBodySchemasByStatusCode types', () => {
    it('infers status code response types for dual-mode routes', () => {
      const contract = buildContract({
        method: 'post',
        pathResolver: () => '/api/chat/completions',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEventSchemas: {
          chunk: z.object({ delta: z.string() }),
        },
        responseBodySchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
          401: z.object({ error: z.literal('Unauthorized') }),
        },
      })

      expectTypeOf(contract.responseBodySchemasByStatusCode).not.toBeUndefined()
    })
  })

  // ============================================================================
  // Cross-cutting Type Discrimination Tests
  // ============================================================================

  describe('contract type discrimination', () => {
    it('REST contracts do not have isSSE property', () => {
      const contract = buildContract({
        method: 'get',
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      // REST contracts should not have isSSE
      expectTypeOf(contract).not.toHaveProperty('isSSE')
    })

    it('REST contracts do not have isDualMode property', () => {
      const contract = buildContract({
        method: 'get',
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      // REST contracts should not have isDualMode
      expectTypeOf(contract).not.toHaveProperty('isDualMode')
    })

    it('SSE contracts have isSSE: true', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      expectTypeOf(contract.isSSE).toEqualTypeOf<true>()
    })

    it('SSE contracts do not have isDualMode property', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      // SSE contracts should not have isDualMode
      expectTypeOf(contract).not.toHaveProperty('isDualMode')
    })

    it('Dual-mode contracts have isDualMode: true', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: {
          update: z.object({ progress: z.number() }),
        },
      })

      expectTypeOf(contract.isDualMode).toEqualTypeOf<true>()
    })

    it('Dual-mode contracts do not have isSSE property', () => {
      const contract = buildContract({
        method: 'get',
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: {
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
        method: 'get',
        successResponseBodySchema: z.object({}),
        requestPathParamsSchema: pathParamsSchema,
        pathResolver: (params) => `/api/users/${params.userId}`,
      })
    })

    it('enforces correct params for SSE routes', () => {
      const paramsSchema = z.object({ channelId: z.string() })

      buildContract({
        method: 'get',
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })
    })

    it('enforces correct params for dual-mode routes', () => {
      const paramsSchema = z.object({ jobId: z.string() })

      buildContract({
        method: 'get',
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        requestPathParamsSchema: paramsSchema,
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEventSchemas: {
          update: z.object({ progress: z.number() }),
        },
      })
    })
  })
})
