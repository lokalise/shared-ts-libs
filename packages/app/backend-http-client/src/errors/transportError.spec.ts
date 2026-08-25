import { describe, expect, it } from 'vitest'
import { InternalRequestError } from './InternalRequestError.ts'
import { getTransportErrorCode, isTransportError, TRANSPORT_ERROR_CODES } from './transportError.ts'

describe('getTransportErrorCode', () => {
  it.each(TRANSPORT_ERROR_CODES)('detects %s on the error itself', (code) => {
    const error = Object.assign(new Error('request failed'), { code })

    expect(getTransportErrorCode(error)).toBe(code)
    expect(isTransportError(error)).toBe(true)
  })

  it('detects a transport error wrapped in the cause chain', () => {
    const undiciError = Object.assign(new Error('Headers Timeout Error'), {
      code: 'UND_ERR_HEADERS_TIMEOUT',
    })
    const wrapped = new InternalRequestError(undiciError, 'Test request')

    expect(getTransportErrorCode(wrapped)).toBe('UND_ERR_HEADERS_TIMEOUT')
    expect(isTransportError(wrapped)).toBe(true)
  })

  it('detects a transport error nested several causes deep', () => {
    const inner = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    const error = new Error('outer', { cause: new Error('middle', { cause: inner }) })

    expect(getTransportErrorCode(error)).toBe('ECONNRESET')
  })

  it('returns undefined for errors with unknown codes', () => {
    const error = Object.assign(new Error('no such file'), { code: 'ENOENT' })

    expect(getTransportErrorCode(error)).toBeUndefined()
    expect(isTransportError(error)).toBe(false)
  })

  it('returns undefined for plain errors and non-errors', () => {
    expect(getTransportErrorCode(new Error('boom'))).toBeUndefined()
    expect(getTransportErrorCode('boom')).toBeUndefined()
    expect(getTransportErrorCode(undefined)).toBeUndefined()
  })

  it('gives up on unbounded cause chains instead of looping forever', () => {
    const error = new Error('cyclic')
    ;(error as Error & { cause: unknown }).cause = error

    expect(getTransportErrorCode(error)).toBeUndefined()
  })
})
