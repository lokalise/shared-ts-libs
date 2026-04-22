import { describe, expect, it } from 'vitest'
import { UnexpectedResponseError } from './UnexpectedResponseError.ts'

describe('UnexpectedResponseError', () => {
  it('sets error params', () => {
    const headers = { 'content-type': 'application/json' }

    const err = new UnexpectedResponseError(500, headers, '')

    expect(err.name).toBe('UnexpectedResponseError')
    expect(err.code).toBe('UNEXPECTED_RESPONSE_ERROR')
    expect(err.statusCode).toBe(500)
    expect(err.headers).toBe(headers)
    expect(err.body).toBe('')
  })

  it('formats message with statusCode and content-type', () => {
    const err = new UnexpectedResponseError(503, { 'content-type': 'text/plain' }, '')

    expect(err.message).toBe('Unexpected response: statusCode=503, contentType=text/plain')
  })

  it('formats message with "none" when content-type is absent', () => {
    const err = new UnexpectedResponseError(503, {}, '')

    expect(err.message).toBe('Unexpected response: statusCode=503, contentType=none')
  })

  it('passes instanceof check via Symbol.hasInstance', () => {
    const err = new UnexpectedResponseError(500, {}, '')

    expect(err).toBeInstanceOf(UnexpectedResponseError)
  })

  it('rejects plain objects without the brand', () => {
    expect(null).not.toBeInstanceOf(UnexpectedResponseError)
    expect({}).not.toBeInstanceOf(UnexpectedResponseError)
    expect(new Error('x')).not.toBeInstanceOf(UnexpectedResponseError)
  })
})
