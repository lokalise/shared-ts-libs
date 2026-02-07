import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { buildContract } from './contractBuilder.ts'

describe('buildContract', () => {
  describe('REST contracts', () => {
    it('creates REST GET contract when no serverSentEvents is provided', () => {
      const contract = buildContract({
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      expect(contract.method).toBe('get')
      expect(contract.pathResolver(undefined)).toBe('/api/users')
      expect('isSSE' in contract).toBe(false)
      expect('isDualMode' in contract).toBe(false)
    })

    it('creates REST POST contract when method is post and requestBodySchema is provided', () => {
      const contract = buildContract({
        method: 'post',
        requestBodySchema: z.object({ name: z.string() }),
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      expect(contract.method).toBe('post')
      expect(contract.requestBodySchema).toBeDefined()
      expect('isSSE' in contract).toBe(false)
      expect('isDualMode' in contract).toBe(false)
    })

    it('creates REST DELETE contract when method is delete', () => {
      const contract = buildContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/users/123',
      })

      expect(contract.method).toBe('delete')
      expect('isSSE' in contract).toBe(false)
      expect('isDualMode' in contract).toBe(false)
    })
  })

  describe('SSE contracts', () => {
    it('creates SSE GET contract when serverSentEvents is provided without requestBodySchema', () => {
      const contract = buildContract({
        pathResolver: () => '/api/stream',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        serverSentEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expect(contract.method).toBe('get')
      expect(contract.isSSE).toBe(true)
      expect('isDualMode' in contract).toBe(false)
      expect(contract.serverSentEvents).toBeDefined()
    })

    it('creates SSE POST contract when serverSentEvents and requestBodySchema are provided', () => {
      const contract = buildContract({
        pathResolver: () => '/api/process',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ data: z.string() }),
        serverSentEvents: {
          progress: z.object({ percent: z.number() }),
        },
      })

      expect(contract.method).toBe('post')
      expect(contract.isSSE).toBe(true)
      expect('isDualMode' in contract).toBe(false)
      expect(contract.requestBodySchema).toBeDefined()
    })
  })

  describe('Dual-mode contracts', () => {
    it('creates dual-mode GET contract when serverSentEvents and successResponseBodySchema are provided', () => {
      const contract = buildContract({
        pathResolver: () => '/api/status',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        successResponseBodySchema: z.object({ status: z.string() }),
        serverSentEvents: {
          update: z.object({ progress: z.number() }),
        },
      })

      expect(contract.method).toBe('get')
      expect(contract.isDualMode).toBe(true)
      expect('isSSE' in contract).toBe(false)
      expect(contract.successResponseBodySchema).toBeDefined()
      expect(contract.serverSentEvents).toBeDefined()
    })

    it('creates dual-mode POST contract when serverSentEvents, successResponseBodySchema, and requestBodySchema are provided', () => {
      const contract = buildContract({
        pathResolver: () => '/api/chat/completions',
        requestPathParamsSchema: z.object({}),
        requestQuerySchema: z.object({}),
        requestHeaderSchema: z.object({}),
        requestBodySchema: z.object({ message: z.string() }),
        successResponseBodySchema: z.object({ reply: z.string() }),
        serverSentEvents: {
          chunk: z.object({ delta: z.string() }),
        },
      })

      expect(contract.method).toBe('post')
      expect(contract.isDualMode).toBe(true)
      expect('isSSE' in contract).toBe(false)
      expect(contract.requestBodySchema).toBeDefined()
      expect(contract.successResponseBodySchema).toBeDefined()
    })
  })
})
