import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ErrorType } from './constants.ts'
import { InternalError } from './InternalError.ts'
import { definePublicError, PublicError } from './PublicError.ts'

const projectNotFoundErrorDefinition = definePublicError({
  code: 'PROJECT_NOT_FOUND',
  type: ErrorType.NOT_FOUND,
})

class ProjectNotFoundError extends PublicError.from(projectNotFoundErrorDefinition) {
  constructor(id: string) {
    super({ message: `Project ${id} not found` })
  }
}

const projectNameAlreadyExistsErrorDefinition = definePublicError({
  code: 'PROJECT_NAME_ALREADY_EXISTS',
  type: ErrorType.CONFLICT,
  detailsSchema: z.object({ name: z.string() }),
})

class ProjectNameAlreadyExistsError extends PublicError.from(
  projectNameAlreadyExistsErrorDefinition,
) {
  constructor(name: string) {
    super({ message: `A project named "${name}" already exists.`, details: { name } })
  }
}

describe('PublicError', () => {
  it('is an instance of PublicError and the concrete class', () => {
    const err = new ProjectNameAlreadyExistsError('foo')
    expect(err).toBeInstanceOf(PublicError)
    expect(err).toBeInstanceOf(ProjectNameAlreadyExistsError)
  })

  it('sets name to the concrete class name, not the bound class name', () => {
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

  it('sibling public error classes do not match each other', () => {
    expect(new ProjectNotFoundError('123') instanceof ProjectNameAlreadyExistsError).toBe(false)
  })

  it('bound public error classes from different definitions do not match', () => {
    const OtherBound = PublicError.from(projectNameAlreadyExistsErrorDefinition)
    expect(new ProjectNotFoundError('123') instanceof OtherBound).toBe(false)
    expect(
      new OtherBound({ message: 'conflict', details: { name: 'foo' } }) instanceof OtherBound,
    ).toBe(true)
  })
})

describe('definePublicError schema', () => {
  it('schema validates a correct payload without details', () => {
    const result = projectNotFoundErrorDefinition.schema.safeParse({
      message: 'not found',
      code: 'PROJECT_NOT_FOUND',
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects a wrong code literal', () => {
    const result = projectNotFoundErrorDefinition.schema.safeParse({
      message: 'not found',
      code: 'WRONG_CODE',
    })
    expect(result.success).toBe(false)
  })

  it('schema validates a correct payload with details', () => {
    const result = projectNameAlreadyExistsErrorDefinition.schema.safeParse({
      message: 'conflict',
      code: 'PROJECT_NAME_ALREADY_EXISTS',
      details: { name: 'foo' },
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects a payload with missing required details', () => {
    const result = projectNameAlreadyExistsErrorDefinition.schema.safeParse({
      message: 'conflict',
      code: 'PROJECT_NAME_ALREADY_EXISTS',
    })
    expect(result.success).toBe(false)
  })
})

// The @ts-expect-error annotations are validated by `tsc`: the literal `code`
// on each class is what creates the nominal distinction that rejects wrong types.
describe('nominal typing', () => {
  class TranslatorTimeoutError extends InternalError {
    override readonly code = 'TRANSLATOR_TIMEOUT'

    constructor() {
      super({ message: 'Translator timed out' })
    }
  }

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
})
