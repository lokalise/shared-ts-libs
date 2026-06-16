import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody } from './constants.ts'
import {
  blobBody,
  isBlobBody,
  isContentResponseEntry,
  isJsonBody,
  isSseBody,
  jsonResponse,
  noContent,
  resolveContractResponse,
  resolveResponseEntry,
  sseBody,
  sseResponse,
  textResponse,
} from './contractResponse.ts'

describe('content-map entry builders', () => {
  it('jsonResponse builds an application/json content entry', () => {
    const schema = z.object({ id: z.string() })
    expect(jsonResponse(schema)).toEqual({ content: { 'application/json': schema } })
  })

  it('jsonResponse includes description only when provided', () => {
    const schema = z.object({ id: z.string() })
    expect(jsonResponse(schema, { description: 'A user' })).toEqual({
      description: 'A user',
      content: { 'application/json': schema },
    })
    expect(jsonResponse(schema)).not.toHaveProperty('description')
  })

  it('noContent builds a no-body entry', () => {
    expect(noContent()).toEqual({ allowNoBody: true })
    expect(noContent({ description: 'Deleted' })).toEqual({
      allowNoBody: true,
      description: 'Deleted',
    })
  })

  it('blobBody and sseBody build descriptors', () => {
    expect(blobBody()).toEqual({ _tag: 'BlobBody' })
    const map = { chunk: z.object({ delta: z.string() }) }
    expect(sseBody(map)).toEqual({ _tag: 'SseBody', schemaByEventName: map })
  })
})

describe('descriptor guards', () => {
  const schema = z.object({ id: z.string() })

  it('isJsonBody is true only for a bare schema', () => {
    expect(isJsonBody(schema)).toBe(true)
    expect(isJsonBody(blobBody())).toBe(false)
    expect(isJsonBody(sseBody({ chunk: z.string() }))).toBe(false)
  })

  it('isBlobBody is true only for blobBody()', () => {
    expect(isBlobBody(blobBody())).toBe(true)
    expect(isBlobBody(schema)).toBe(false)
    expect(isBlobBody(sseBody({ chunk: z.string() }))).toBe(false)
  })

  it('isSseBody is true only for sseBody()', () => {
    expect(isSseBody(sseBody({ chunk: z.string() }))).toBe(true)
    expect(isSseBody(schema)).toBe(false)
    expect(isSseBody(blobBody())).toBe(false)
  })
})

describe('isContentResponseEntry', () => {
  it('is true for content-map and no-body entries', () => {
    expect(isContentResponseEntry({ content: { 'application/json': z.string() } })).toBe(true)
    expect(isContentResponseEntry({ allowNoBody: true })).toBe(true)
    expect(isContentResponseEntry(jsonResponse(z.string()))).toBe(true)
    expect(isContentResponseEntry(noContent())).toBe(true)
  })

  it('is false for legacy response values', () => {
    expect(isContentResponseEntry(z.object({ id: z.string() }))).toBe(false)
    expect(isContentResponseEntry(ContractNoBody)).toBe(false)
    expect(isContentResponseEntry(textResponse('text/csv'))).toBe(false)
    expect(isContentResponseEntry(sseResponse({ chunk: z.string() }))).toBe(false)
  })
})

describe('resolveContractResponse — content entries', () => {
  it('returns noContent for a no-body entry regardless of content-type', () => {
    expect(resolveContractResponse(noContent(), undefined)).toEqual({ kind: 'noContent' })
    expect(resolveContractResponse(noContent(), 'application/json')).toEqual({ kind: 'noContent' })
  })

  it('matches a JSON media type exactly', () => {
    const schema = z.object({ id: z.string() })
    expect(resolveContractResponse(jsonResponse(schema), 'application/json')).toEqual({
      kind: 'json',
      schema,
    })
  })

  it('strips content-type parameters and is case-insensitive', () => {
    const schema = z.object({ id: z.string() })
    expect(
      resolveContractResponse(jsonResponse(schema), 'Application/JSON; charset=utf-8'),
    ).toEqual({ kind: 'json', schema })
  })

  it('disambiguates multiple JSON media types by exact content-type', () => {
    const a = z.object({ a: z.string() })
    const b = z.object({ b: z.string() })
    const entry = { content: { 'application/json': a, 'application/json+01': b } }
    expect(resolveContractResponse(entry, 'application/json')).toEqual({ kind: 'json', schema: a })
    expect(resolveContractResponse(entry, 'application/json+01')).toEqual({
      kind: 'json',
      schema: b,
    })
  })

  it('does not match a superstring media type', () => {
    const schema = z.object({ id: z.string() })
    expect(resolveContractResponse(jsonResponse(schema), 'application/json+oops')).toBeNull()
  })

  it('resolves blob and sse descriptors', () => {
    const sseMap = { chunk: z.object({ delta: z.string() }) }
    expect(resolveContractResponse({ content: { 'image/png': blobBody() } }, 'image/png')).toEqual({
      kind: 'blob',
    })
    expect(
      resolveContractResponse(
        { content: { 'text/event-stream': sseBody(sseMap) } },
        'text/event-stream',
      ),
    ).toEqual({ kind: 'sse', schemaByEventName: sseMap })
  })

  it('handles an absent content-type', () => {
    const schema = z.object({ id: z.string() })
    // strict: no allowNoBody → null
    expect(resolveContractResponse(jsonResponse(schema), undefined)).toBeNull()
    // allowNoBody → noContent
    expect(
      resolveContractResponse(
        { content: { 'application/json': schema }, allowNoBody: true },
        undefined,
      ),
    ).toEqual({ kind: 'noContent' })
    // non-strict single media type → that descriptor
    expect(resolveContractResponse(jsonResponse(schema), undefined, false)).toEqual({
      kind: 'json',
      schema,
    })
  })

  it('returns null for an unmatched content-type when multiple media types exist', () => {
    const entry = { content: { 'application/json': z.string(), 'application/xml': z.string() } }
    expect(resolveContractResponse(entry, 'text/plain')).toBeNull()
    // non-strict does not fall back when there is more than one media type
    expect(resolveContractResponse(entry, 'text/plain', false)).toBeNull()
  })
})

describe('resolveResponseEntry — mixed legacy and content entries', () => {
  it('resolves a content entry at an exact status code', () => {
    const schema = z.object({ id: z.string() })
    const responses = { 200: jsonResponse(schema) }
    expect(resolveResponseEntry(responses, 200, 'application/json', true)).toEqual({
      kind: 'json',
      schema,
    })
  })

  it('resolves legacy and content entries side by side', () => {
    const ok = z.object({ id: z.string() })
    const err = z.object({ message: z.string() })
    const responses = {
      200: jsonResponse(ok), // content entry
      404: err, // legacy bare schema
      204: noContent(), // content no-body entry
    }
    expect(resolveResponseEntry(responses, 200, 'application/json', true)).toEqual({
      kind: 'json',
      schema: ok,
    })
    expect(resolveResponseEntry(responses, 404, 'application/json', true)).toEqual({
      kind: 'json',
      schema: err,
    })
    expect(resolveResponseEntry(responses, 204, undefined, true)).toEqual({ kind: 'noContent' })
  })

  it('falls back through range and default keys to a content entry', () => {
    const ranged = z.object({ code: z.string() })
    const responses = { '4xx': jsonResponse(ranged), default: noContent() }
    expect(resolveResponseEntry(responses, 404, 'application/json', true)).toEqual({
      kind: 'json',
      schema: ranged,
    })
    expect(resolveResponseEntry(responses, 500, undefined, true)).toEqual({ kind: 'noContent' })
  })
})
