import { describe, expect, it } from 'vitest'
import { ResponseParseError } from './ResponseParseError.ts'

describe('ResponseParseError', () => {
  it('instanceof check returns true for instances', () => {
    const err = new ResponseParseError({
      message: 'bad json',
      errorCode: 'INVALID_HTTP_RESPONSE_JSON',
      rawBody: '{ broken',
      requestLabel: 'my-request',
    })

    expect(err instanceof ResponseParseError).toBe(true)
    expect(err.errorCode).toBe('INVALID_HTTP_RESPONSE_JSON')
    expect(err.details.rawBody).toBe('{ broken')
    expect(err.details.requestLabel).toBe('my-request')
  })

  it('instanceof check returns false for non-instances', () => {
    expect(new Error('oops') instanceof ResponseParseError).toBe(false)
    expect((null as unknown) instanceof ResponseParseError).toBe(false)
  })
})
