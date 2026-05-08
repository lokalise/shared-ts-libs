import { describe, expect, it } from 'vitest'
import { InternalRequestError, isInternalRequestError } from './InternalRequestError.ts'

describe('InternalRequestError', () => {
  it('uses cause message when cause is an Error', () => {
    const cause = new Error('connection refused')
    const err = new InternalRequestError(cause, 'my-request')

    expect(err.message).toBe('connection refused')
    expect(err.cause).toBe(cause)
    expect(err.requestLabel).toBe('my-request')
    expect(err.name).toBe('InternalRequestError')
  })

  it('falls back to "Request error" when cause is not an Error', () => {
    const err = new InternalRequestError('something went wrong')

    expect(err.message).toBe('Request error')
    expect(err.cause).toBe('something went wrong')
  })

  it('isInternalRequestError returns true for instances', () => {
    const err = new InternalRequestError(new Error('oops'))

    expect(isInternalRequestError(err)).toBe(true)
  })

  it('isInternalRequestError returns false for plain errors', () => {
    expect(isInternalRequestError(new Error('oops'))).toBe(false)
    expect(isInternalRequestError(null)).toBe(false)
    expect(isInternalRequestError('string')).toBe(false)
  })

  it('instanceof check works cross-realm via Symbol brand', () => {
    const err = new InternalRequestError(new Error('oops'))

    expect(err instanceof InternalRequestError).toBe(true)
  })
})
