import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import {
  blobBody,
  blobResponse,
  isJsonBody,
  isJsonResponse,
  noBodyResponse,
  resolveContractResponse,
  resolveResponseEntry,
  sseBody,
  sseResponse,
} from './contractResponse.ts'

describe('isJsonResponse', () => {
  it('returns true for a ZodType schema', () => {
    expect(isJsonResponse(z.object({ id: z.string() }))).toBe(true)
  })

  it('returns false for a noBodyResponse', () => {
    expect(isJsonResponse(noBodyResponse())).toBe(false)
  })
})

describe('isJsonBody', () => {
  it('returns true for a bare Zod schema (content-map JSON descriptor)', () => {
    expect(isJsonBody(z.object({ id: z.string() }))).toBe(true)
  })

  it('returns false for blobBody and sseBody descriptors', () => {
    expect(isJsonBody(blobBody())).toBe(false)
    expect(isJsonBody(sseBody({ update: z.string() }))).toBe(false)
  })
})

describe('factory description option', () => {
  it('noBodyResponse includes description when provided', () => {
    expect(noBodyResponse({ description: 'No content' })).toMatchObject({
      description: 'No content',
    })
  })

  it('noBodyResponse omits description when not provided', () => {
    expect(noBodyResponse()).not.toHaveProperty('description')
  })
})

describe('noBodyResponse', () => {
  it('returns a content-map no-body entry', () => {
    expect(noBodyResponse()).toEqual({ allowNoBody: true })
  })
})

describe('blobResponse', () => {
  it('builds a single-media-type content entry', () => {
    expect(blobResponse('image/png')).toEqual({ content: { 'image/png': blobBody() } })
  })

  it('includes description when provided', () => {
    expect(blobResponse('image/png', { description: 'PNG' })).toMatchObject({ description: 'PNG' })
  })

  it('resolves to blob for the declared media type', () => {
    expect(resolveContractResponse(blobResponse('image/png'), 'image/png')).toEqual({
      kind: 'blob',
    })
  })
})

describe('sseResponse', () => {
  const schemas = { tick: z.object({ n: z.number() }) }

  it('builds a text/event-stream content entry', () => {
    expect(sseResponse(schemas)).toEqual({ content: { 'text/event-stream': sseBody(schemas) } })
  })

  it('resolves to sse', () => {
    expect(resolveContractResponse(sseResponse(schemas), 'text/event-stream')).toEqual({
      kind: 'sse',
      schemaByEventName: schemas,
    })
  })
})

describe('resolveContractResponse', () => {
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

  describe('strict: false', () => {
    it('resolves single json entry when content-type is absent', () => {
      const schema = z.object({ id: z.string() })
      expect(resolveContractResponse(schema, undefined, false)).toEqual({ kind: 'json', schema })
    })

    it('resolves single json entry when content-type does not match', () => {
      const schema = z.object({ id: z.string() })
      expect(resolveContractResponse(schema, 'text/plain', false)).toEqual({ kind: 'json', schema })
    })
  })

  describe('content-map entry', () => {
    const jsonSchema = z.object({ id: z.string() })

    it('resolves a JSON descriptor by exact media type', () => {
      const entry = { content: { 'application/json': jsonSchema } }
      expect(resolveContractResponse(entry, 'application/json')).toEqual({
        kind: 'json',
        schema: jsonSchema,
      })
    })

    it('resolves a blobBody descriptor', () => {
      const entry = { content: { 'application/pdf': blobBody() } }
      expect(resolveContractResponse(entry, 'application/pdf')).toEqual({ kind: 'blob' })
    })

    it('resolves an sseBody descriptor', () => {
      const schemaByEventName = { tick: z.object({ n: z.number() }) }
      const entry = { content: { 'text/event-stream': sseBody(schemaByEventName) } }
      expect(resolveContractResponse(entry, 'text/event-stream')).toEqual({
        kind: 'sse',
        schemaByEventName,
      })
    })

    it('matches media types exactly, ignoring parameters and case', () => {
      const entry = { content: { 'application/json': jsonSchema } }
      expect(resolveContractResponse(entry, 'Application/JSON; charset=utf-8')).toEqual({
        kind: 'json',
        schema: jsonSchema,
      })
    })

    it('keeps distinct JSON media types separate', () => {
      const v2 = z.object({ data: z.object({ id: z.string() }) })
      const entry = { content: { 'application/json': jsonSchema, 'application/vnd.api+json': v2 } }
      expect(resolveContractResponse(entry, 'application/vnd.api+json')).toEqual({
        kind: 'json',
        schema: v2,
      })
    })

    it('returns noContent for a no-body content entry', () => {
      expect(resolveContractResponse({ allowNoBody: true }, 'application/json')).toEqual({
        kind: 'noContent',
      })
    })

    it('returns noContent when content-type is absent and allowNoBody is set', () => {
      const entry = { content: { 'application/json': jsonSchema }, allowNoBody: true }
      expect(resolveContractResponse(entry, undefined)).toEqual({ kind: 'noContent' })
    })

    it('returns null when content-type is absent (strict, no allowNoBody)', () => {
      const entry = { content: { 'application/json': jsonSchema } }
      expect(resolveContractResponse(entry, undefined)).toBeNull()
    })

    it('falls back to the sole descriptor when content-type is absent and strict is false', () => {
      const entry = { content: { 'application/json': jsonSchema } }
      expect(resolveContractResponse(entry, undefined, false)).toEqual({
        kind: 'json',
        schema: jsonSchema,
      })
    })

    it('returns null on content-type mismatch (strict)', () => {
      const entry = { content: { 'application/json': jsonSchema } }
      expect(resolveContractResponse(entry, 'text/csv')).toBeNull()
    })

    it('falls back to the sole descriptor on mismatch when strict is false', () => {
      const entry = { content: { 'application/json': jsonSchema } }
      expect(resolveContractResponse(entry, 'text/csv', false)).toEqual({
        kind: 'json',
        schema: jsonSchema,
      })
    })

    it('returns null on mismatch with multiple descriptors even when strict is false', () => {
      const entry = { content: { 'application/json': jsonSchema, 'application/pdf': blobBody() } }
      expect(resolveContractResponse(entry, 'text/csv', false)).toBeNull()
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

  it('resolves noBodyResponse() regardless of content-type', () => {
    expect(resolveResponseEntry({ 204: noBodyResponse() }, 204, undefined, true)).toEqual({
      kind: 'noContent',
    })
  })

  describe('getRangeKey boundaries', () => {
    const schema = z.object({ x: z.string() })
    // Use a contract with all five range keys so a mismatch (null from getRangeKey) falls to null,
    // and a match resolves to the schema with kind 'json'.
    const allRanges = {
      '1xx': schema,
      '2xx': schema,
      '3xx': schema,
      '4xx': schema,
      '5xx': schema,
    }

    it.each([
      [99, null],
      [100, { kind: 'json', schema }],
      [199, { kind: 'json', schema }],
      [200, { kind: 'json', schema }],
      [299, { kind: 'json', schema }],
      [300, { kind: 'json', schema }],
      [599, { kind: 'json', schema }],
      [600, null],
    ])('status %i → %s', (statusCode, expected) => {
      expect(resolveResponseEntry(allRanges, statusCode, 'application/json', true)).toEqual(
        expected,
      )
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

    it('resolves via 1xx range for any informational code', () => {
      const schema = z.object({ info: z.string() })
      expect(resolveResponseEntry({ '1xx': schema }, 100, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
    })

    it('resolves via 3xx range for any redirect code', () => {
      const schema = z.object({ location: z.string() })
      expect(resolveResponseEntry({ '3xx': schema }, 301, 'application/json', true)).toEqual({
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

    it('multiple range keys each route correctly and default is not invoked for covered codes', () => {
      const s4xx = z.object({ clientError: z.string() })
      const s5xx = z.object({ serverError: z.string() })
      const def = z.object({ fallback: z.string() })
      const contract = { '4xx': s4xx, '5xx': s5xx, default: def }
      // 4xx code → 4xx range
      expect(resolveResponseEntry(contract, 404, 'application/json', true)).toEqual({
        kind: 'json',
        schema: s4xx,
      })
      // 5xx code → 5xx range
      expect(resolveResponseEntry(contract, 503, 'application/json', true)).toEqual({
        kind: 'json',
        schema: s5xx,
      })
      // code not covered by either range → default
      expect(resolveResponseEntry(contract, 304, 'application/json', true)).toEqual({
        kind: 'json',
        schema: def,
      })
    })

    it('2xx range takes precedence over default for success codes', () => {
      const s2xx = z.object({ data: z.string() })
      const def = z.object({ fallback: z.string() })
      // success code → 2xx range, not default
      expect(
        resolveResponseEntry({ '2xx': s2xx, default: def }, 201, 'application/json', true),
      ).toEqual({ kind: 'json', schema: s2xx })
      // non-2xx code with no range → default
      expect(
        resolveResponseEntry({ '2xx': s2xx, default: def }, 404, 'application/json', true),
      ).toEqual({ kind: 'json', schema: def })
    })

    it('returns null when range does not cover the status code', () => {
      expect(
        resolveResponseEntry({ '2xx': z.object({}) }, 404, 'application/json', true),
      ).toBeNull()
    })

    it('falls through to default when status code is outside all ranges', () => {
      const schema = z.object({ error: z.string() })
      expect(resolveResponseEntry({ default: schema }, 0, 'application/json', true)).toEqual({
        kind: 'json',
        schema,
      })
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
