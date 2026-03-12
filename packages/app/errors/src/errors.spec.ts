import { z } from 'zod/v4'
import { describe, expect, it } from 'vitest'
import { BaseError } from './BaseError.ts'
import { InternalError } from './InternalError.ts'
import { PublicError, definePublicError } from './PublicError.ts'
import { ErrorType } from './constants.ts'

// ─── Concrete test errors ────────────────────────────────────────────────────

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

const projectNotFoundDef = definePublicError({
  code: 'PROJECT_NOT_FOUND',
  type: ErrorType.NOT_FOUND,
})

class ProjectNotFoundError extends PublicError.from(projectNotFoundDef) {
  constructor(id: string) {
    super({ message: `Project ${id} not found` })
  }
}

const projectConflictDef = definePublicError({
  code: 'PROJECT_NAME_ALREADY_EXISTS',
  type: ErrorType.CONFLICT,
  detailsSchema: z.object({ name: z.string() }),
})

class ProjectNameAlreadyExistsError extends PublicError.from(projectConflictDef) {
  constructor(name: string) {
    super({ message: `A project named "${name}" already exists.`, details: { name } })
  }
}

// ─── InternalError ───────────────────────────────────────────────────────────

describe('InternalError', () => {
  it('is an instance of Error and BaseError', () => {
    const err = new TranslatorTimeoutError('t-1')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(BaseError)
    expect(err).toBeInstanceOf(InternalError)
  })

  it('sets message', () => {
    expect(new TranslatorTimeoutError('t-1').message).toBe('Translator t-1 timed out')
  })

  it('sets name to the concrete class name', () => {
    expect(new TranslatorTimeoutError('t-1').name).toBe('TranslatorTimeoutError')
  })

  it('exposes a literal code', () => {
    expect(new TranslatorTimeoutError('t-1').code).toBe('TRANSLATOR_TIMEOUT')
  })

  it('details is undefined when not provided', () => {
    expect(new TranslatorTimeoutError('t-1').details).toBeUndefined()
  })

  it('carries typed details when provided', () => {
    expect(new DatabaseQueryError('SELECT 1').details).toEqual({ query: 'SELECT 1' })
  })

  it('forwards cause', () => {
    const cause = new Error('root')
    expect(new DatabaseQueryError('SELECT 1', cause).cause).toBe(cause)
  })

  it('includes a stack trace', () => {
    expect(new TranslatorTimeoutError('t-1').stack).toBeDefined()
  })
})

// ─── PublicError ─────────────────────────────────────────────────────────────

describe('PublicError', () => {
  it('is an instance of Error and BaseError', () => {
    const err = new ProjectNameAlreadyExistsError('foo')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(BaseError)
    expect(err).toBeInstanceOf(PublicError)
  })

  it('sets message', () => {
    expect(new ProjectNameAlreadyExistsError('foo').message).toBe(
      'A project named "foo" already exists.',
    )
  })

  it('sets name to the concrete class name', () => {
    expect(new ProjectNameAlreadyExistsError('foo').name).toBe('ProjectNameAlreadyExistsError')
  })

  it('exposes a literal code from the definition', () => {
    expect(new ProjectNameAlreadyExistsError('foo').code).toBe('PROJECT_NAME_ALREADY_EXISTS')
  })

  it('exposes a literal type from the definition', () => {
    expect(new ProjectNameAlreadyExistsError('foo').type).toBe('conflict')
  })

  it('carries typed details when schema is defined', () => {
    expect(new ProjectNameAlreadyExistsError('foo').details).toEqual({ name: 'foo' })
  })

  it('details is undefined when no schema is defined', () => {
    expect(new ProjectNotFoundError('123').details).toBeUndefined()
  })

  it('returns the correct httpStatusCode', () => {
    expect(new ProjectNameAlreadyExistsError('foo').httpStatusCode).toBe(409)
    expect(new ProjectNotFoundError('123').httpStatusCode).toBe(404)
  })
})

// ─── definePublicError schema ────────────────────────────────────────────────

describe('definePublicError schema', () => {
  it('schema validates a correct payload without details', () => {
    const result = projectNotFoundDef.schema.safeParse({ message: 'not found', code: 'PROJECT_NOT_FOUND' })
    expect(result.success).toBe(true)
  })

  it('schema rejects a wrong code literal', () => {
    const result = projectNotFoundDef.schema.safeParse({ message: 'not found', code: 'WRONG_CODE' })
    expect(result.success).toBe(false)
  })

  it('schema validates a correct payload with details', () => {
    const result = projectConflictDef.schema.safeParse({
      message: 'conflict',
      code: 'PROJECT_NAME_ALREADY_EXISTS',
      details: { name: 'foo' },
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects a payload with missing required details', () => {
    const result = projectConflictDef.schema.safeParse({
      message: 'conflict',
      code: 'PROJECT_NAME_ALREADY_EXISTS',
    })
    expect(result.success).toBe(false)
  })
})

// ─── Nominal typing — errors cannot be mixed ─────────────────────────────────
//
// These @ts-expect-error annotations are validated by `tsc`: the literal `code`
// on each class is what creates the nominal distinction that rejects wrong types.

describe('nominal typing', () => {
  it('InternalError subclasses are not interchangeable', () => {
    const getTranslatorError = (): TranslatorTimeoutError => {
      // @ts-expect-error — DatabaseQueryError is not assignable to TranslatorTimeoutError
      return new DatabaseQueryError('SELECT 1')
    }
    expect(getTranslatorError).toBeDefined()
  })

  it('PublicError subclasses are not interchangeable', () => {
    const getConflictError = (): ProjectNameAlreadyExistsError => {
      // @ts-expect-error — ProjectNotFoundError is not assignable to ProjectNameAlreadyExistsError
      return new ProjectNotFoundError('123')
    }
    expect(getConflictError).toBeDefined()
  })

  it('InternalError and PublicError subclasses are not interchangeable', () => {
    const getInternalError = (): TranslatorTimeoutError => {
      // @ts-expect-error — ProjectNameAlreadyExistsError is not assignable to TranslatorTimeoutError
      return new ProjectNameAlreadyExistsError('foo')
    }
    expect(getInternalError).toBeDefined()
  })

  it('correct error can be returned without a compile error', () => {
    const getError = (): TranslatorTimeoutError => new TranslatorTimeoutError('t-1')
    expect(getError().code).toBe('TRANSLATOR_TIMEOUT')
  })
})
