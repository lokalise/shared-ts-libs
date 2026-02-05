import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { buildContract } from './contractBuilder.ts'

describe('buildContract', () => {
  describe('REST contracts', () => {
    it('creates REST GET contract when no sseEvents is provided', () => {
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
    it('creates SSE GET contract when sseEvents is provided without requestBody', () => {
      const contract = buildContract({
        pathResolver: () => '/api/stream',
        params: z.object({}),
        query: z.object({}),
        requestHeaders: z.object({}),
        sseEvents: {
          message: z.object({ text: z.string() }),
        },
      })

      expect(contract.method).toBe('get')
      expect(contract.isSSE).toBe(true)
      expect('isDualMode' in contract).toBe(false)
      expect(contract.sseEvents).toBeDefined()
    })

    it('creates SSE POST contract when sseEvents and requestBody are provided', () => {
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

      expect(contract.method).toBe('post')
      expect(contract.isSSE).toBe(true)
      expect('isDualMode' in contract).toBe(false)
      expect(contract.requestBody).toBeDefined()
    })
  })

  describe('Dual-mode contracts', () => {
    it('creates dual-mode GET contract when sseEvents and syncResponseBody are provided', () => {
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

      expect(contract.method).toBe('get')
      expect(contract.isDualMode).toBe(true)
      expect('isSSE' in contract).toBe(false)
      expect(contract.syncResponseBody).toBeDefined()
      expect(contract.sseEvents).toBeDefined()
    })

    it('creates dual-mode POST contract when sseEvents, syncResponseBody, and requestBody are provided', () => {
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

      expect(contract.method).toBe('post')
      expect(contract.isDualMode).toBe(true)
      expect('isSSE' in contract).toBe(false)
      expect(contract.requestBody).toBeDefined()
      expect(contract.syncResponseBody).toBeDefined()
    })
  })
})
