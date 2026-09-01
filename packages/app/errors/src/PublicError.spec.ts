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

  it('cannot be extended directly — from is the only creation path', () => {
    // @ts-expect-error — the constructor is private; use PublicError.from
    class DirectlyExtendedError extends PublicError {}
    expect(DirectlyExtendedError).toBeDefined()
  })

  it('bound public error classes from different definitions do not match', () => {
    const OtherBound = PublicError.from(projectNameAlreadyExistsErrorDefinition)
    expect(new ProjectNotFoundError('123') instanceof OtherBound).toBe(false)
    expect(
      new OtherBound({ message: 'conflict', details: { name: 'foo' } }) instanceof OtherBound,
    ).toBe(true)
  })
})

describe('isInstance', () => {
  it('matches the family and the concrete class', () => {
    const err: unknown = new ProjectNameAlreadyExistsError('foo')
    expect(PublicError.isInstance(err)).toBe(true)
    expect(ProjectNameAlreadyExistsError.isInstance(err)).toBe(true)
  })

  it('does not match the InternalError family or sibling classes', () => {
    const err: unknown = new ProjectNameAlreadyExistsError('foo')
    expect(InternalError.isInstance(err)).toBe(false)
    expect(ProjectNotFoundError.isInstance(err)).toBe(false)
  })

  it('rejects plain errors and non-objects', () => {
    expect(PublicError.isInstance(new Error('boom'))).toBe(false)
    expect(PublicError.isInstance(null)).toBe(false)
    expect(PublicError.isInstance(undefined)).toBe(false)
  })

  it('narrows to the class it is called on', () => {
    const err: unknown = new ProjectNameAlreadyExistsError('foo')
    if (PublicError.isInstance(err)) {
      // narrowed to the family — httpStatusCode is available
      expect(err.httpStatusCode).toBe(409)
    } else {
      expect.unreachable()
    }
    if (ProjectNameAlreadyExistsError.isInstance(err)) {
      // narrowed to the concrete class — details.name is typed as string
      expect(err.details.name).toBe('foo')
    } else {
      expect.unreachable()
    }
  })
})

describe('toPayload', () => {
  it('returns message, code and details when a details schema is defined', () => {
    expect(new ProjectNameAlreadyExistsError('foo').toPayload()).toEqual({
      message: 'A project named "foo" already exists.',
      code: 'PROJECT_NAME_ALREADY_EXISTS',
      errorCode: 'PROJECT_NAME_ALREADY_EXISTS',
      details: { name: 'foo' },
    })
  })

  it('omits the details key when no details schema is defined', () => {
    const payload = new ProjectNotFoundError('123').toPayload()
    expect(payload).toEqual({
      message: 'Project 123 not found',
      code: 'PROJECT_NOT_FOUND',
      errorCode: 'PROJECT_NOT_FOUND',
    })
    expect('details' in payload).toBe(false)
  })

  it('excludes non-public fields', () => {
    const error = new ProjectNameAlreadyExistsError('foo')
    const payload = error.toPayload()
    expect('stack' in payload).toBe(false)
    expect('cause' in payload).toBe(false)
    expect('name' in payload).toBe(false)
    expect('type' in payload).toBe(false)
  })

  it('satisfies the definition schema', () => {
    expect(
      projectNameAlreadyExistsErrorDefinition.schema.safeParse(
        new ProjectNameAlreadyExistsError('foo').toPayload(),
      ).success,
    ).toBe(true)
    expect(
      projectNotFoundErrorDefinition.schema.safeParse(new ProjectNotFoundError('123').toPayload())
        .success,
    ).toBe(true)
  })

  it('exposes optional, inspectable details on the payload seen by a generic handler', () => {
    const errors: PublicError[] = [
      new ProjectNameAlreadyExistsError('foo'),
      new ProjectNotFoundError('123'),
    ]

    for (const err of errors) {
      const payload = err.toPayload()
      // For the wide PublicError type, details types as Record<string, unknown> | undefined
      const details: Record<string, unknown> | undefined = payload.details
      expect(details).toEqual(err.details)
    }
  })

  it('types details with the schema input type when input and output differ', () => {
    const transformDetailsErrorDefinition = definePublicError({
      code: 'TRANSFORM_DETAILS',
      type: ErrorType.BAD_REQUEST,
      detailsSchema: z.object({ count: z.string().transform(Number) }),
    })
    const TransformDetailsError = PublicError.from(transformDetailsErrorDefinition)

    // The error never runs the schema, so details and the payload hold
    // input-typed values. A transform only executes when the server
    // serializes the response, outside this package.
    const error = new TransformDetailsError({ message: 'count invalid', details: { count: '5' } })
    const detailsCount: string = error.details.count
    expect(detailsCount).toBe('5')

    const payloadCount: string = error.toPayload().details.count
    expect(payloadCount).toBe('5')
  })

  it('preserves literal code and typed details in the payload type', () => {
    const payload = new ProjectNameAlreadyExistsError('foo').toPayload()
    const code: 'PROJECT_NAME_ALREADY_EXISTS' = payload.code
    const name: string = payload.details.name
    expect(code).toBe('PROJECT_NAME_ALREADY_EXISTS')
    expect(name).toBe('foo')

    const noDetailsPayload = new ProjectNotFoundError('123').toPayload()
    // @ts-expect-error — details is absent when the definition has no detailsSchema
    expect(noDetailsPayload.details?.name).toBeUndefined()
  })
})

describe('definePublicError schema', () => {
  it('schema validates a correct payload without details', () => {
    const result = projectNotFoundErrorDefinition.schema.safeParse({
      message: 'not found',
      code: 'PROJECT_NOT_FOUND',
      errorCode: 'PROJECT_NOT_FOUND',
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
      errorCode: 'PROJECT_NAME_ALREADY_EXISTS',
      details: { name: 'foo' },
    })
    expect(result.success).toBe(true)
  })

  it('schema rejects a payload with missing required details', () => {
    const result = projectNameAlreadyExistsErrorDefinition.schema.safeParse({
      message: 'conflict',
      code: 'PROJECT_NAME_ALREADY_EXISTS',
      errorCode: 'PROJECT_NAME_ALREADY_EXISTS',
    })
    expect(result.success).toBe(false)
  })

  it('schema marks the deprecated errorCode alias as deprecated in its metadata', () => {
    expect(projectNotFoundErrorDefinition.schema.shape.errorCode.meta()).toEqual({
      deprecated: true,
    })
  })

  it('schema rejects an errorCode alias that does not match the code literal', () => {
    const result = projectNotFoundErrorDefinition.schema.safeParse({
      message: 'not found',
      code: 'PROJECT_NOT_FOUND',
      errorCode: 'WRONG_CODE',
    })
    expect(result.success).toBe(false)
  })
})

describe('deprecated errorCode alias', () => {
  it('mirrors code on instances', () => {
    const err = new ProjectNotFoundError('123')
    expect(err.errorCode).toBe('PROJECT_NOT_FOUND')
    expect(err.errorCode).toBe(err.code)
  })
})

// The @ts-expect-error annotations are validated by `tsc`: the literal `code`
// on each class is what creates the nominal distinction that rejects wrong types.
describe('nominal typing', () => {
  class TranslatorTimeoutError extends InternalError.from('TRANSLATOR_TIMEOUT') {
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
