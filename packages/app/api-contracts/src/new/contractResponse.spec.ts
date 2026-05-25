import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody } from './constants.ts'
import {
  anyOfResponses,
  blobResponse,
  isJsonResponse,
  isNoBodyResponse,
  noBodyResponse,
  resolveContractResponse,
  resolveResponseEntry,
  sseResponse,
  textResponse,
} from './contractResponse.ts'

describe('isJsonResponse', () => {
  it('returns true for a ZodType schema', () => {
    expect(isJsonResponse(z.object({ id: z.string() }))).toBe(true)
  })

  it('returns false for textResponse', () => {
    expect(isJsonResponse(textResponse('text/csv'))).toBe(false)
  })

  it('returns false for blobResponse', () => {
    expect(isJsonResponse(blobResponse('image/png'))).toBe(false)
  })

  it('returns false for sseResponse', () => {
    expect(isJsonResponse(sseResponse({ update: z.string() }))).toBe(false)
  })

  it('returns false for anyOfResponses', () => {
    expect(isJsonResponse(anyOfResponses([z.object({ id: z.string() })]))).toBe(false)
  })

  it('returns false for ContractNoBody', () => {
    expect(isJsonResponse(ContractNoBody)).toBe(false)
  })
})

describe('factory description option', () => {
  it('textResponse includes description when provided', () => {
    expect(textResponse('text/csv', { description: 'CSV export' })).toMatchObject({
      description: 'CSV export',
    })
  })

  it('textResponse omits description when not provided', () => {
    expect(textResponse('text/csv')).not.toHaveProperty('description')
  })

  it('blobResponse includes description when provided', () => {
    expect(blobResponse('image/png', { description: 'PNG image' })).toMatchObject({
      description: 'PNG image',
    })
  })

  it('blobResponse omits description when not provided', () => {
    expect(blobResponse('image/png')).not.toHaveProperty('description')
  })

  it('sseResponse includes description when provided', () => {
    expect(sseResponse({ update: z.string() }, { description: 'SSE stream' })).toMatchObject({
      description: 'SSE stream',
    })
  })

  it('sseResponse omits description when not provided', () => {
    expect(sseResponse({ update: z.string() })).not.toHaveProperty('description')
  })

  it('anyOfResponses includes description when provided', () => {
    expect(
      anyOfResponses([z.object({ id: z.string() })], { description: 'Multiple types' }),
    ).toMatchObject({
      description: 'Multiple types',
    })
  })

  it('anyOfResponses omits description when not provided', () => {
    expect(anyOfResponses([z.object({ id: z.string() })])).not.toHaveProperty('description')
  })

  it('noBodyResponse includes description when provided', () => {
    expect(noBodyResponse({ description: 'No content' })).toMatchObject({
      description: 'No content',
    })
  })

  it('noBodyResponse omits description when not provided', () => {
    expect(noBodyResponse()).not.toHaveProperty('description')
  })
})

describe('noBodyResponse / isNoBodyResponse', () => {
  it('noBodyResponse returns correct tag', () => {
    expect(noBodyResponse()).toEqual({ _tag: 'NoBodyResponse' })
  })

  it('isNoBodyResponse returns true for noBodyResponse()', () => {
    expect(isNoBodyResponse(noBodyResponse())).toBe(true)
  })

  it('isNoBodyResponse returns false for ContractNoBody symbol', () => {
    expect(isNoBodyResponse(ContractNoBody)).toBe(false)
  })

  it('isNoBodyResponse returns false for other tagged responses', () => {
    expect(isNoBodyResponse(textResponse('text/csv'))).toBe(false)
    expect(isNoBodyResponse(blobResponse('image/png'))).toBe(false)
    expect(isNoBodyResponse(sseResponse({ update: z.string() }))).toBe(false)
    expect(isNoBodyResponse(anyOfResponses([z.object({ id: z.string() })]))).toBe(false)
  })
})

describe('resolveContractResponse', () => {
  describe('ContractNoBody', () => {
    it('returns noContent regardless of content-type', () => {
      expect(resolveContractResponse(ContractNoBody, 'application/json')).toEqual({
        kind: 'noContent',
      })
      expect(resolveContractResponse(ContractNoBody, undefined)).toEqual({ kind: 'noContent' })
    })
  })

  describe('noBodyResponse', () => {
    it('returns noContent regardless of content-type', () => {
      expect(resolveContractResponse(noBodyResponse(), 'application/json')).toEqual({
        kind: 'noContent',
      })
      expect(resolveContractResponse(noBodyResponse(), undefined)).toEqual({ kind: 'noContent' })
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
      expect(resolveContractResponse(textResponse('text/csv'), undefined, false)).toEqual({
        kind: 'text',
      })
    })

    it('resolves single blob entry when content-type is absent', () => {
      expect(resolveContractResponse(blobResponse('image/png'), undefined, false)).toEqual({
        kind: 'blob',
      })
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

describe('resolveResponseEntry', () => {
  it('returns null when status code is not in the contract', () => {
    expect(resolveResponseEntry({}, 404, 'application/json', true)).toBeNull()
  })

  it('resolves the entry when status code matches', () => {
    const schema = z.object({ id: z.string() })
    const result = resolveResponseEntry({ 200: schema }, 200, 'application/json', true)
    expect(result).toEqual({ kind: 'json', schema })
  })

  it('returns null when content-type is absent and strict is true', () => {
    const schema = z.object({ id: z.string() })
    expect(resolveResponseEntry({ 200: schema }, 200, undefined, true)).toBeNull()
  })

  it('falls back to entry kind when content-type is absent and strict is false', () => {
    const schema = z.object({ id: z.string() })
    const result = resolveResponseEntry({ 200: schema }, 200, undefined, false)
    expect(result).toEqual({ kind: 'json', schema })
  })

  it('resolves ContractNoBody regardless of content-type', () => {
    expect(resolveResponseEntry({ 204: ContractNoBody }, 204, undefined, true)).toEqual({
      kind: 'noContent',
    })
  })

  describe('range key fallback', () => {
    it('resolves via 2xx range for any success code', () => {
      const schema = z.object({ id: z.string() })
      expect(resolveResponseEntry({ '2xx': schema }, 200, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
      expect(resolveResponseEntry({ '2xx': schema }, 201, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
    })

    it('resolves via 4xx range for any client-error code', () => {
      const schema = z.object({ message: z.string() })
      expect(resolveResponseEntry({ '4xx': schema }, 404, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
      expect(resolveResponseEntry({ '4xx': schema }, 400, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
    })

    it('resolves via 5xx range for any server-error code', () => {
      const schema = z.object({ error: z.string() })
      expect(resolveResponseEntry({ '5xx': schema }, 500, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
      expect(resolveResponseEntry({ '5xx': schema }, 503, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
    })

    it('exact code takes precedence over range key', () => {
      const exact = z.object({ id: z.string() })
      const range = z.object({ message: z.string() })
      expect(
        resolveResponseEntry({ 200: exact, '2xx': range }, 200, 'application/json', true),
      ).toEqual({ kind: 'json', schema: exact })
    })

    it('range key takes precedence over default', () => {
      const range = z.object({ message: z.string() })
      const def = z.object({ error: z.string() })
      expect(
        resolveResponseEntry({ '5xx': range, default: def }, 500, 'application/json', true),
      ).toEqual({ kind: 'json', schema: range })
    })

    it('returns null when range does not cover the status code', () => {
      expect(
        resolveResponseEntry({ '2xx': z.object({}) }, 404, 'application/json', true),
      ).toBeNull()
    })
  })

  describe('default fallback', () => {
    it('resolves via default when no exact or range match', () => {
      const schema = z.object({ error: z.string() })
      expect(resolveResponseEntry({ default: schema }, 503, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
    })

    it('resolves via default for any status code when it is the only entry', () => {
      const schema = z.object({ message: z.string() })
      expect(resolveResponseEntry({ default: schema }, 200, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
      expect(resolveResponseEntry({ default: schema }, 404, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
    })

    it('exact code takes precedence over default', () => {
      const exact = z.object({ id: z.string() })
      const def = z.object({ error: z.string() })
      expect(
        resolveResponseEntry({ 200: exact, default: def }, 200, 'application/json', true),
      ).toEqual({ kind: 'json', schema: exact })
    })
  })
})
