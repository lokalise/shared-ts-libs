import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody } from './constants.ts'
import {
  anyOfResponses,
  blobResponse,
  resolveContractResponse,
  sseResponse,
  textResponse,
} from './contractResponse.ts'

describe('resolveContractResponse', () => {
  describe('ContractNoBody', () => {
    it('returns noContent regardless of content-type', () => {
      expect(resolveContractResponse(ContractNoBody, 'application/json')).toEqual({
        kind: 'noContent',
      })
      expect(resolveContractResponse(ContractNoBody, undefined)).toEqual({ kind: 'noContent' })
    })
  })

  describe('missing content-type', () => {
    it('returns null for typed responses when content-type is absent', () => {
      expect(resolveContractResponse(z.object({ id: z.string() }), undefined)).toBeNull()
      expect(resolveContractResponse(textResponse('text/csv'), undefined)).toBeNull()
      expect(resolveContractResponse(blobResponse('image/png'), undefined)).toBeNull()
    })
  })

  describe('JSON (ZodType)', () => {
    it('resolves to json for application/json content-type', () => {
      const schema = z.object({ id: z.string() })
      const result = resolveContractResponse(schema, 'application/json')
      expect(result).toEqual({ kind: 'json', schema })
    })

    it('returns null for non-json content-type', () => {
      const schema = z.object({ id: z.string() })
      expect(resolveContractResponse(schema, 'text/plain')).toBeNull()
    })
  })

  describe('textResponse', () => {
    it('resolves to text when content-type matches', () => {
      expect(resolveContractResponse(textResponse('text/csv'), 'text/csv; charset=utf-8')).toEqual({
        kind: 'text',
      })
    })

    it('returns null when content-type does not match', () => {
      expect(resolveContractResponse(textResponse('text/csv'), 'application/json')).toBeNull()
    })
  })

  describe('blobResponse', () => {
    it('resolves to blob when content-type matches', () => {
      expect(resolveContractResponse(blobResponse('image/png'), 'image/png')).toEqual({
        kind: 'blob',
      })
    })

    it('returns null when content-type does not match', () => {
      expect(resolveContractResponse(blobResponse('image/png'), 'application/json')).toBeNull()
    })
  })

  describe('sseResponse', () => {
    it('resolves to sse for text/event-stream content-type', () => {
      const schema = { update: z.object({ id: z.string() }) }
      const result = resolveContractResponse(sseResponse(schema), 'text/event-stream')
      expect(result).toEqual({ kind: 'sse', schemaByEventName: schema })
    })

    it('returns null for non-sse content-type', () => {
      expect(
        resolveContractResponse(sseResponse({ update: z.string() }), 'application/json'),
      ).toBeNull()
    })
  })

  describe('strict: false', () => {
    it('resolves single json entry when content-type is absent', () => {
      const schema = z.object({ id: z.string() })
      expect(resolveContractResponse(schema, undefined, false)).toEqual({ kind: 'json', schema })
    })

    it('resolves single json entry when content-type does not match', () => {
      const schema = z.object({ id: z.string() })
      expect(resolveContractResponse(schema, 'text/plain', false)).toEqual({ kind: 'json', schema })
    })

    it('resolves single text entry when content-type is absent', () => {
      expect(resolveContractResponse(textResponse('text/csv'), undefined, false)).toEqual({ kind: 'text' })
    })

    it('resolves single blob entry when content-type is absent', () => {
      expect(resolveContractResponse(blobResponse('image/png'), undefined, false)).toEqual({ kind: 'blob' })
    })

    it('resolves single sse entry when content-type is absent', () => {
      const schema = { update: z.object({ id: z.string() }) }
      expect(resolveContractResponse(sseResponse(schema), undefined, false)).toEqual({
        kind: 'sse',
        schemaByEventName: schema,
      })
    })

    it('still returns null for anyOfResponses when content-type is absent', () => {
      const entry = anyOfResponses([textResponse('text/csv'), z.object({ id: z.string() })])
      expect(resolveContractResponse(entry, undefined, false)).toBeNull()
    })

    it('still returns null for anyOfResponses when content-type does not match', () => {
      const entry = anyOfResponses([textResponse('text/csv'), blobResponse('image/png')])
      expect(resolveContractResponse(entry, 'application/json', false)).toBeNull()
    })
  })

  describe('anyOfResponses', () => {
    it('resolves to the first matching entry by content-type', () => {
      const schema = z.object({ id: z.string() })
      const entry = anyOfResponses([textResponse('text/csv'), schema])

      expect(resolveContractResponse(entry, 'text/csv')).toEqual({ kind: 'text' })
      expect(resolveContractResponse(entry, 'application/json')).toEqual({ kind: 'json', schema })
    })

    it('resolves SSE entry inside anyOfResponses', () => {
      const sseSchema = { tick: z.object({ count: z.number() }) }
      const entry = anyOfResponses([sseResponse(sseSchema), z.object({ total: z.number() })])

      expect(resolveContractResponse(entry, 'text/event-stream')).toEqual({
        kind: 'sse',
        schemaByEventName: sseSchema,
      })
    })

    it('returns null when no entry matches content-type', () => {
      const entry = anyOfResponses([textResponse('text/csv'), blobResponse('image/png')])
      expect(resolveContractResponse(entry, 'application/json')).toBeNull()
    })
  })
})
