import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { buildSseContract } from './sseContractBuilders.ts'

describe('contractBuilders', () => {
  describe('buildSseContract (SSE with body)', () => {
    const baseConfig = {
      method: 'post' as const,
      pathResolver: () => '/api/test',
      requestPathParamsSchema: z.object({}),
      requestQuerySchema: z.object({}),
      requestHeaderSchema: z.object({}),
      requestBodySchema: z.object({ message: z.string() }),
      serverSentEventSchemas: {
        data: z.object({ value: z.string() }),
      },
    }

    it('requires serverSentEventSchemas - missing serverSentEventSchemas produces clear error', () => {
      // @ts-expect-error - serverSentEventSchemas is required for SSE contracts
      const _postChatStreamByIdContractMalformed = buildSseContract({
        method: 'post',
        pathResolver: () => '/',
        requestPathParamsSchema: z.object({
          id: z.string(),
        }),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({}),
      })
    })

    it('uses POST method', () => {
      const route = buildSseContract(baseConfig)

      expect(route.method).toBe('post')
      expect(route.pathResolver({})).toBe('/api/test')
      expect(route.isSSE).toBe(true)
    })

    it('uses specified method when provided', () => {
      const route = buildSseContract({
        ...baseConfig,
        method: 'put',
      })

      expect(route.method).toBe('put')
    })

    it('supports PATCH method', () => {
      const route = buildSseContract({
        ...baseConfig,
        method: 'patch',
      })

      expect(route.method).toBe('patch')
    })
  })

  describe('buildSseContract (SSE GET)', () => {
    it('creates GET SSE route', () => {
      const route = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({ userId: z.string() }),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      expect(route.method).toBe('get')
      expect(route.pathResolver({})).toBe('/api/stream')
      expect(route.isSSE).toBe(true)
      expect(route.requestBodySchema).toBeUndefined()
    })

    it('includes responseBodySchemasByStatusCode for SSE GET', () => {
      const route = buildSseContract({
        method: 'get',
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        requestPathParamsSchema: z.object({ channelId: z.string() }),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({ authorization: z.string() }),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
        responseBodySchemasByStatusCode: {
          401: z.object({ error: z.literal('Unauthorized') }),
          404: z.object({ error: z.literal('Channel not found') }),
        },
      })

      expect(route.isSSE).toBe(true)
      expect(route.responseBodySchemasByStatusCode).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[401]).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[404]).toBeDefined()
    })
  })

  describe('buildSseContract (SSE POST with responseBodySchemasByStatusCode)', () => {
    it('includes responseBodySchemasByStatusCode for SSE POST', () => {
      const route = buildSseContract({
        method: 'post',
        pathResolver: () => '/api/process/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({ authorization: z.string() }),
        requestBodySchema: z.object({ fileId: z.string() }),
        serverSentEventSchemas: {
          progress: z.object({ percent: z.number() }),
          done: z.object({ result: z.string() }),
        },
        responseBodySchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
          401: z.object({ error: z.literal('Unauthorized') }),
          404: z.object({ error: z.literal('File not found') }),
        },
      })

      expect(route.isSSE).toBe(true)
      expect(route.responseBodySchemasByStatusCode).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[400]).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[401]).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[404]).toBeDefined()
    })
  })

  describe('buildSseContract (Dual-mode with body)', () => {
    const baseConfig = {
      method: 'post' as const,
      pathResolver: () => '/api/chat/completions',
      requestPathParamsSchema: z.object({}),
      requestQuerySchema: z.object({}),
      requestHeaderSchema: z.object({}),
      requestBodySchema: z.object({ message: z.string() }),
      successResponseBodySchema: z.object({
        reply: z.string(),
        usage: z.object({ tokens: z.number() }),
      }),
      serverSentEventSchemas: {
        chunk: z.object({ content: z.string() }),
        done: z.object({ usage: z.object({ totalTokens: z.number() }) }),
      },
    }

    it('uses POST method', () => {
      const route = buildSseContract(baseConfig)

      expect(route.method).toBe('post')
      expect(route.pathResolver({})).toBe('/api/chat/completions')
      expect(route.isDualMode).toBe(true)
    })

    it('uses specified method when provided', () => {
      const route = buildSseContract({
        ...baseConfig,
        method: 'put',
      })

      expect(route.method).toBe('put')
    })

    it('supports PATCH method', () => {
      const route = buildSseContract({
        ...baseConfig,
        method: 'patch',
      })

      expect(route.method).toBe('patch')
    })

    it('includes responseHeaderSchema when provided', () => {
      const route = buildSseContract({
        ...baseConfig,
        responseHeaderSchema: z.object({
          'x-ratelimit-limit': z.string(),
          'x-ratelimit-remaining': z.string(),
        }),
      })

      expect(route.responseHeaderSchema).toBeDefined()
    })

    it('includes responseBodySchemasByStatusCode when provided', () => {
      const route = buildSseContract({
        ...baseConfig,
        responseBodySchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
          404: z.object({ error: z.string() }),
          500: z.object({ error: z.string(), stack: z.string().optional() }),
        },
      })

      expect(route.responseBodySchemasByStatusCode).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[400]).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[404]).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[500]).toBeDefined()
    })
  })

  describe('buildSseContract (Dual-mode GET)', () => {
    it('creates GET dual-mode route', () => {
      const route = buildSseContract({
        method: 'get',
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        requestPathParamsSchema: z.object({ jobId: z.string().uuid() }),
        requestQuerySchema: z.object({ verbose: z.string().optional() }),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({
          status: z.enum(['pending', 'running', 'completed', 'failed']),
          progress: z.number(),
          result: z.string().optional(),
        }),
        serverSentEventSchemas: {
          progress: z.object({ percent: z.number(), message: z.string().optional() }),
          done: z.object({ result: z.string() }),
        },
      })

      expect(route.method).toBe('get')
      expect(route.pathResolver({ jobId: '123' })).toBe('/api/jobs/123/status')
      expect(route.isDualMode).toBe(true)
      expect(route.requestBodySchema).toBeUndefined()
    })

    it('includes responseBodySchemasByStatusCode for GET dual-mode', () => {
      const route = buildSseContract({
        method: 'get',
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        requestPathParamsSchema: z.object({ jobId: z.string().uuid() }),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({
          status: z.string(),
        }),
        serverSentEventSchemas: {
          done: z.object({ result: z.string() }),
        },
        responseBodySchemasByStatusCode: {
          404: z.object({ error: z.literal('Job not found') }),
        },
      })

      expect(route.responseBodySchemasByStatusCode).toBeDefined()
      expect(route.responseBodySchemasByStatusCode?.[404]).toBeDefined()
    })
  })

  describe('type safety', () => {
    it('cannot use method GET with requestBodySchema', () => {
      buildSseContract({
        // @ts-expect-error - GET method is not allowed when requestBodySchema is provided
        method: 'get',
        pathResolver: () => '/api/test',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEventSchemas: {
          data: z.object({ value: z.string() }),
        },
      })
    })

    it('types path params correctly', () => {
      const route = buildSseContract({
        method: 'get',
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        requestPathParamsSchema: z.object({ channelId: z.string() }),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          message: z.object({ text: z.string() }),
        },
      })

      // Type check - this should compile without errors
      const path = route.pathResolver({ channelId: 'test-channel' })
      expect(path).toBe('/api/channels/test-channel/stream')
    })

    it('types request body correctly', () => {
      const route = buildSseContract({
        method: 'post',
        pathResolver: () => '/api/test',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string(), count: z.number() }),
        serverSentEventSchemas: {
          chunk: z.object({ content: z.string() }),
        },
      })

      // Verify request body schema shape
      expect(route.requestBodySchema).toBeDefined()
      expect(route.requestBodySchema?.shape.message).toBeDefined()
      expect(route.requestBodySchema?.shape.count).toBeDefined()
    })

    it('types SSE events correctly', () => {
      const route = buildSseContract({
        method: 'get',
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEventSchemas: {
          chunk: z.object({ content: z.string() }),
          done: z.object({ totalTokens: z.number() }),
        },
      })

      // Verify event schemas
      expect(route.serverSentEventSchemas.chunk).toBeDefined()
      expect(route.serverSentEventSchemas.done).toBeDefined()
    })

    it('types sync response correctly for dual-mode', () => {
      const route = buildSseContract({
        method: 'post',
        pathResolver: () => '/api/chat',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({
          reply: z.string(),
          usage: z.object({ tokens: z.number() }),
        }),
        serverSentEventSchemas: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      // Verify sync response schema shape
      expect(route.successResponseBodySchema.shape.reply).toBeDefined()
      expect(route.successResponseBodySchema.shape.usage).toBeDefined()
    })
  })
})
