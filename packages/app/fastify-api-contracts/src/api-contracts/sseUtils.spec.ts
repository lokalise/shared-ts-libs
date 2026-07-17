import type { FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { determineResponseContentType } from './sseUtils.ts'

const requestWithAccept = (accept?: string): FastifyRequest =>
  ({ headers: accept === undefined ? {} : { accept } }) as FastifyRequest

describe('determineResponseContentType', () => {
  it('returns the candidate the Accept header names exactly', () => {
    const contentType = determineResponseContentType(requestWithAccept('application/json'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBe('application/json')
  })

  it('works for any media type, not just JSON/SSE', () => {
    const contentType = determineResponseContentType(requestWithAccept('text/csv'), [
      'application/json',
      'text/csv',
    ])

    expect(contentType).toBe('text/csv')
  })

  it('respects q= quality values when picking among candidates', () => {
    const contentType = determineResponseContentType(
      requestWithAccept('application/json;q=0.5, text/event-stream;q=0.9'),
      ['application/json', 'text/event-stream'],
    )

    expect(contentType).toBe('text/event-stream')
  })

  it('excludes media types rejected with q=0', () => {
    const contentType = determineResponseContentType(
      requestWithAccept('text/event-stream;q=0, application/json'),
      ['application/json', 'text/event-stream'],
    )

    expect(contentType).toBe('application/json')
  })

  it('resolves */* to the first candidate (server preference order)', () => {
    const contentType = determineResponseContentType(requestWithAccept('*/*'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBe('application/json')
  })

  it('matches a type/* wildcard against the candidate subtype', () => {
    const contentType = determineResponseContentType(requestWithAccept('text/*'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBe('text/event-stream')
  })

  it('matches media types case-insensitively', () => {
    const contentType = determineResponseContentType(requestWithAccept('Application/JSON'), [
      'application/json',
    ])

    expect(contentType).toBe('application/json')
  })

  it('returns undefined when the request has no Accept header', () => {
    expect(determineResponseContentType(requestWithAccept(), ['application/json'])).toBeUndefined()
  })

  it('returns undefined when no candidate is acceptable', () => {
    const contentType = determineResponseContentType(requestWithAccept('image/png'), [
      'application/json',
      'text/event-stream',
    ])

    expect(contentType).toBeUndefined()
  })
})
