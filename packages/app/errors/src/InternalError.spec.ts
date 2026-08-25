import { describe, expect, it } from 'vitest'
import { InternalError } from './InternalError.ts'

class TranslatorTimeoutError extends InternalError {
  override readonly code = 'TRANSLATOR_TIMEOUT'

  constructor(translatorId: string) {
    super({ message: `Translator ${translatorId} timed out` })
  }
}

class DatabaseQueryError extends InternalError<{ query: string }> {
  override readonly code = 'DATABASE_QUERY_ERROR'

  constructor(query: string, cause?: unknown) {
    super({ message: 'Database query failed', details: { query }, cause })
  }
}

describe('InternalError', () => {
  it('is an instance of InternalError and the concrete class', () => {
    const err = new TranslatorTimeoutError('t-1')
    expect(err).toBeInstanceOf(InternalError)
    expect(err).toBeInstanceOf(TranslatorTimeoutError)
  })

  it('exposes a literal code', () => {
    expect(new TranslatorTimeoutError('t-1').code).toBe('TRANSLATOR_TIMEOUT')
  })

  it('sibling internal error classes do not match each other', () => {
    expect(new TranslatorTimeoutError('t-1') instanceof DatabaseQueryError).toBe(false)
  })

  describe('nominal typing', () => {
    it('InternalError subclasses are not interchangeable', () => {
      const getTranslatorError = (): TranslatorTimeoutError => {
        // @ts-expect-error — DatabaseQueryError is not assignable to TranslatorTimeoutError
        return new DatabaseQueryError('SELECT 1')
      }
      expect(getTranslatorError).toBeDefined()
    })

    it('correct error can be returned without a compile error', () => {
      const getError = (): TranslatorTimeoutError => new TranslatorTimeoutError('t-1')
      expect(getError().code).toBe('TRANSLATOR_TIMEOUT')
    })
  })
})
