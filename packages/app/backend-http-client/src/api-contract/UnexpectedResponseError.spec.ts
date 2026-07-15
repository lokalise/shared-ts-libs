import { describe, expect, it } from 'vitest'
import { UnexpectedResponseError } from './UnexpectedResponseError.ts'

describe('UnexpectedResponseError', () => {
  it('sets error params', () => {
    const headers = { 'content-type': 'application/json' }

    const err = new UnexpectedResponseError(500, headers, '', 'Fetch product')

    expect(err.name).toBe('UnexpectedResponseError')
    expect(err.code).toBe('UNEXPECTED_RESPONSE_ERROR')
    expect(err.statusCode).toBe(500)
    expect(err.headers).toBe(headers)
    expect(err.body).toBe('')
    expect(err.summary).toBe('Fetch product')
  })

  it('formats message with summary, statusCode and content-type', () => {
    const err = new UnexpectedResponseError(
      503,
      { 'content-type': 'text/plain' },
      '',
      'Fetch product',
    )

    expect(err.message).toBe(
      'Unexpected response for "Fetch product": statusCode=503, contentType=text/plain',
    )
  })

  it('formats message with "none" when content-type is absent', () => {
    const err = new UnexpectedResponseError(503, {}, '', 'Fetch product')

    expect(err.message).toBe(
      'Unexpected response for "Fetch product": statusCode=503, contentType=none',
    )
  })

  it('passes instanceof check via Symbol.hasInstance', () => {
    const err = new UnexpectedResponseError(500, {}, '', 'Fetch product')

    expect(err).toBeInstanceOf(UnexpectedResponseError)
  })

  it('rejects plain objects without the brand', () => {
    expect(null).not.toBeInstanceOf(UnexpectedResponseError)
    expect({}).not.toBeInstanceOf(UnexpectedResponseError)
    expect(new Error('x')).not.toBeInstanceOf(UnexpectedResponseError)
  })
})
