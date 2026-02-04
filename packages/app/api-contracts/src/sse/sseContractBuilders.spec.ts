import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { buildSseContract } from './sseContractBuilders.ts'

describe('contractBuilders', () => {
  describe('buildSseContract (SSE with body)', () => {
    const baseConfig = {
      pathResolver: () => '/api/test',
      params: z.object({}),
      query: z.object({}),
      requestHeaders: z.object({}),
      requestBody: z.object({ message: z.string() }),
      sseEvents: {
        data: z.object({ value: z.string() }),
      },
    }

    it('defaults method to POST when not specified', () => {
      const route = buildSseContract(baseConfig)

      expect(route.method).toBe('POST')
      expect(route.pathResolver({})).toBe('/api/test')
      expect(route.isSSE).toBe(true)
    })

    it('uses specified method when provided', () => {
      const route = buildSseContract({
        ...baseConfig,
        method: 'PUT',
      })

      expect(route.method).toBe('PUT')
    })

    it('supports PATCH method', () => {
      const route = buildSseContract({
        ...baseConfig,
        method: 'PATCH',
      })

      expect(route.method).toBe('PATCH')
    })
  })

  describe('buildSseContract (SSE GET)', () => {
    it('creates GET SSE route', () => {
      const route = buildSseContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({ userId: z.string() }),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expect(route.method).toBe('GET')
      expect(route.pathResolver({})).toBe('/api/stream')
      expect(route.isSSE).toBe(true)
      expect(route.requestBody).toBeUndefined()
    })

    it('includes responseSchemasByStatusCode for SSE GET', () => {
      const route = buildSseContract({
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        params: z.object({ channelId: z.string() }),
        query: z.object({}),
        requestHeaders: z.object({ authorization: z.string() }),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
        responseSchemasByStatusCode: {
          401: z.object({ error: z.literal('Unauthorized') }),
          404: z.object({ error: z.literal('Channel not found') }),
        },
      })

      expect(route.isSSE).toBe(true)
      expect(route.responseSchemasByStatusCode).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[401]).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[404]).toBeDefined()
    })
  })

  describe('buildSseContract (SSE POST with responseSchemasByStatusCode)', () => {
    it('includes responseSchemasByStatusCode for SSE POST', () => {
      const route = buildSseContract({
        method: 'POST',
        pathResolver: () => '/api/process/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({ authorization: z.string() }),
        requestBody: z.object({ fileId: z.string() }),
        sseEvents: {
          progress: z.object({ percent: z.number() }),
          done: z.object({ result: z.string() }),
        },
        responseSchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
          401: z.object({ error: z.literal('Unauthorized') }),
          404: z.object({ error: z.literal('File not found') }),
        },
      })

      expect(route.isSSE).toBe(true)
      expect(route.responseSchemasByStatusCode).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[400]).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[401]).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[404]).toBeDefined()
    })
  })

  describe('buildSseContract (Dual-mode with body)', () => {
    const baseConfig = {
      pathResolver: () => '/api/chat/completions',
      params: z.object({}),
      query: z.object({}),
      requestHeaders: z.object({}),
      requestBody: z.object({ message: z.string() }),
      syncResponseBody: z.object({
        reply: z.string(),
        usage: z.object({ tokens: z.number() }),
      }),
      sseEvents: {
        chunk: z.object({ content: z.string() }),
        done: z.object({ usage: z.object({ totalTokens: z.number() }) }),
      },
    }

    it('defaults method to POST when not specified', () => {
      const route = buildSseContract(baseConfig)

      expect(route.method).toBe('POST')
      expect(route.pathResolver({})).toBe('/api/chat/completions')
      expect(route.isDualMode).toBe(true)
      expect(route.isSimplified).toBe(true)
    })

    it('uses specified method when provided', () => {
      const route = buildSseContract({
        ...baseConfig,
        method: 'PUT',
      })

      expect(route.method).toBe('PUT')
    })

    it('supports PATCH method', () => {
      const route = buildSseContract({
        ...baseConfig,
        method: 'PATCH',
      })

      expect(route.method).toBe('PATCH')
    })

    it('includes responseHeaders when provided', () => {
      const route = buildSseContract({
        ...baseConfig,
        responseHeaders: z.object({
          'x-ratelimit-limit': z.string(),
          'x-ratelimit-remaining': z.string(),
        }),
      })

      expect(route.responseHeaders).toBeDefined()
    })

    it('includes responseSchemasByStatusCode when provided', () => {
      const route = buildSseContract({
        ...baseConfig,
        responseSchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
          404: z.object({ error: z.string() }),
          500: z.object({ error: z.string(), stack: z.string().optional() }),
        },
      })

      expect(route.responseSchemasByStatusCode).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[400]).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[404]).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[500]).toBeDefined()
    })
  })

  describe('buildSseContract (Dual-mode GET)', () => {
    it('creates GET dual-mode route', () => {
      const route = buildSseContract({
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        params: z.object({ jobId: z.string().uuid() }),
        query: z.object({ verbose: z.string().optional() }),
        requestHeaders: z.object({}),
        syncResponseBody: z.object({
          status: z.enum(['pending', 'running', 'completed', 'failed']),
          progress: z.number(),
          result: z.string().optional(),
        }),
        sseEvents: {
          progress: z.object({ percent: z.number(), message: z.string().optional() }),
          done: z.object({ result: z.string() }),
        },
      })

      expect(route.method).toBe('GET')
      expect(route.pathResolver({ jobId: '123' })).toBe('/api/jobs/123/status')
      expect(route.isDualMode).toBe(true)
      expect(route.requestBody).toBeUndefined()
    })

    it('includes responseSchemasByStatusCode for GET dual-mode', () => {
      const route = buildSseContract({
        pathResolver: (params) => `/api/jobs/${params.jobId}/status`,
        params: z.object({ jobId: z.string().uuid() }),
        query: z.object({}),
        requestHeaders: z.object({}),
        syncResponseBody: z.object({
          status: z.string(),
        }),
        sseEvents: {
          done: z.object({ result: z.string() }),
        },
        responseSchemasByStatusCode: {
          404: z.object({ error: z.literal('Job not found') }),
        },
      })

      expect(route.responseSchemasByStatusCode).toBeDefined()
      expect(route.responseSchemasByStatusCode?.[404]).toBeDefined()
    })
  })

  describe('type safety', () => {
    it('types path params correctly', () => {
      const route = buildSseContract({
        pathResolver: (params) => `/api/channels/${params.channelId}/stream`,
        params: z.object({ channelId: z.string() }),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      // Type check - this should compile without errors
      const path = route.pathResolver({ channelId: 'test-channel' })
      expect(path).toBe('/api/channels/test-channel/stream')
    })

    it('types request body correctly', () => {
      const route = buildSseContract({
        method: 'POST',
        pathResolver: () => '/api/test',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: z.object({ message: z.string(), count: z.number() }),
        sseEvents: {
          chunk: z.object({ content: z.string() }),
        },
      })

      // Verify request body schema shape
      expect(route.requestBody).toBeDefined()
      expect(route.requestBody?.shape.message).toBeDefined()
      expect(route.requestBody?.shape.count).toBeDefined()
    })

    it('types SSE events correctly', () => {
      const route = buildSseContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          chunk: z.object({ content: z.string() }),
          done: z.object({ totalTokens: z.number() }),
        },
      })

      // Verify event schemas
      expect(route.sseEvents.chunk).toBeDefined()
      expect(route.sseEvents.done).toBeDefined()
    })

    it('types sync response correctly for dual-mode', () => {
      const route = buildSseContract({
        method: 'POST',
        pathResolver: () => '/api/chat',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        requestBody: z.object({ message: z.string() }),
        syncResponseBody: z.object({
          reply: z.string(),
          usage: z.object({ tokens: z.number() }),
        }),
        sseEvents: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      // Verify sync response schema shape
      expect(route.syncResponseBody.shape.reply).toBeDefined()
      expect(route.syncResponseBody.shape.usage).toBeDefined()
    })
  })
})
