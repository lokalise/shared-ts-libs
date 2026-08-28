import { describe, expect, it } from 'vitest'
import { InternalError } from './InternalError.ts'

class TranslatorTimeoutError extends InternalError.from('TRANSLATOR_TIMEOUT') {
  constructor(translatorId: string) {
    super({ message: `Translator ${translatorId} timed out` })
  }
}

class DatabaseQueryError extends InternalError.from('DATABASE_QUERY_ERROR')<{ query: string }> {
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

  it('exposes the deprecated errorCode alias mirroring code', () => {
    expect(new TranslatorTimeoutError('t-1').errorCode).toBe('TRANSLATOR_TIMEOUT')
  })

  it('sibling internal error classes do not match each other', () => {
    expect(new TranslatorTimeoutError('t-1') instanceof DatabaseQueryError).toBe(false)
  })

  describe('isInstance', () => {
    it('matches the family and the concrete class', () => {
      const err: unknown = new DatabaseQueryError('SELECT 1')
      expect(InternalError.isInstance(err)).toBe(true)
      expect(DatabaseQueryError.isInstance(err)).toBe(true)
    })

    it('rejects sibling classes, plain errors, and non-objects', () => {
      expect(DatabaseQueryError.isInstance(new TranslatorTimeoutError('t-1'))).toBe(false)
      expect(InternalError.isInstance(new Error('boom'))).toBe(false)
      expect(InternalError.isInstance(null)).toBe(false)
      expect(InternalError.isInstance('boom')).toBe(false)
    })

    it('narrows to the class it is called on', () => {
      const err: unknown = new DatabaseQueryError('SELECT 1')
      if (DatabaseQueryError.isInstance(err)) {
        // narrowed — details.query is typed as string
        expect(err.details.query).toBe('SELECT 1')
      } else {
        expect.unreachable()
      }
    })
  })

  it('cannot be extended directly — from is the only creation path', () => {
    // @ts-expect-error — the constructor is private; use InternalError.from
    class DirectlyExtendedError extends InternalError {
      override readonly code = 'DIRECTLY_EXTENDED'
    }
    expect(DirectlyExtendedError).toBeDefined()
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

  describe('from', () => {
    class LockAcquisitionError extends InternalError.from('LOCK_ACQUISITION_FAILED') {
      constructor(lockName: string) {
        super({ message: `Failed to acquire lock ${lockName}` })
      }
    }

    class CacheReadError extends InternalError.from('CACHE_READ_ERROR')<{ key: string }> {
      constructor(key: string, cause?: unknown) {
        super({ message: 'Cache read failed', details: { key }, cause })
      }
    }

    it('preserves the literal code without a manual readonly override', () => {
      const err = new LockAcquisitionError('l-1')
      const literalCode: 'LOCK_ACQUISITION_FAILED' = err.code
      expect(literalCode).toBe('LOCK_ACQUISITION_FAILED')
    })

    it('makes code readonly', () => {
      const err = new LockAcquisitionError('l-1')
      // @ts-expect-error — code is readonly
      err.code = 'SOMETHING_ELSE'
    })

    it('is an instance of InternalError, the bound class, and the concrete class', () => {
      const err: unknown = new LockAcquisitionError('l-1')
      expect(err).toBeInstanceOf(InternalError)
      expect(err).toBeInstanceOf(LockAcquisitionError)
      expect(InternalError.isInstance(err)).toBe(true)
      expect(LockAcquisitionError.isInstance(err)).toBe(true)
    })

    it('types details via the type argument in the extends clause', () => {
      const err: unknown = new CacheReadError('user:1')
      if (CacheReadError.isInstance(err)) {
        // narrowed — details.key is typed as string
        expect(err.details.key).toBe('user:1')
      } else {
        expect.unreachable()
      }
    })

    it('names the bound class after the code', () => {
      expect(Object.getPrototypeOf(LockAcquisitionError).name).toBe(
        'InternalError<LOCK_ACQUISITION_FAILED>',
      )
    })

    it('sibling bound classes do not match each other', () => {
      const err = new LockAcquisitionError('l-1')
      expect(err instanceof CacheReadError).toBe(false)
      expect(CacheReadError.isInstance(err)).toBe(false)
    })

    it('can be instantiated directly without subclassing', () => {
      const DirectError = InternalError.from('DIRECT_ERROR')
      const err = new DirectError({ message: 'boom' })
      expect(err.code).toBe('DIRECT_ERROR')
      expect(err.name).toBe('InternalError<DIRECT_ERROR>')
      expect(InternalError.isInstance(err)).toBe(true)
      expect(DirectError.isInstance(err)).toBe(true)
    })

    it('classes created via from are not interchangeable', () => {
      const getLockError = (): LockAcquisitionError => {
        // @ts-expect-error — CacheReadError is not assignable to LockAcquisitionError
        return new CacheReadError('user:1')
      }
      expect(getLockError).toBeDefined()
    })

    it('discriminating a union by code narrows details', () => {
      const err: LockAcquisitionError | CacheReadError = new CacheReadError('user:1')
      if (err.code === 'CACHE_READ_ERROR') {
        const key: string = err.details.key
        expect(key).toBe('user:1')
      } else {
        expect.unreachable()
      }
    })
  })

  describe('create', () => {
    it('builds an instance without declaring a class', () => {
      const err = InternalError.create({
        code: 'LQA_REVIEW_MISSING',
        message: 'LQA produced no review for the segment',
      })
      expect(err.message).toBe('LQA produced no review for the segment')
      expect(err.name).toBe('InternalError<LQA_REVIEW_MISSING>')
      expect(InternalError.isInstance(err)).toBe(true)
    })

    it('preserves the literal code', () => {
      const err = InternalError.create({ code: 'ONE_OFF', message: 'boom' })
      const literalCode: 'ONE_OFF' = err.code
      expect(literalCode).toBe('ONE_OFF')
    })

    it('types details from the provided value', () => {
      const err = InternalError.create({
        code: 'WITH_DETAILS',
        message: 'boom',
        details: { attempt: 1 },
      })
      const attempt: number = err.details.attempt
      expect(attempt).toBe(1)
    })

    it('accepts a cause', () => {
      const cause = new Error('root')
      const err = InternalError.create({ code: 'WITH_CAUSE', message: 'boom', cause })
      expect(err.cause).toBe(cause)
    })

    it('reuses one class per code', () => {
      const first = InternalError.create({ code: 'SHARED_CODE', message: 'first' })
      const second = InternalError.create({ code: 'SHARED_CODE', message: 'second' })
      expect(Object.getPrototypeOf(first)).toBe(Object.getPrototypeOf(second))
    })

    it('shares identity with a from class of the same code', () => {
      const created = InternalError.create({ code: 'SHARED_WITH_FROM', message: 'boom' })
      expect(InternalError.from('SHARED_WITH_FROM').isInstance(created)).toBe(true)
      expect(InternalError.from('OTHER_CODE').isInstance(created)).toBe(false)
    })
  })
})
