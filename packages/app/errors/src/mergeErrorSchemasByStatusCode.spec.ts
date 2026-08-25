import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ErrorType } from './constants.ts'
import { mergeErrorSchemasByStatusCode } from './mergeErrorSchemasByStatusCode.ts'
import { definePublicError, PublicError } from './PublicError.ts'

const projectNotFoundErrorDefinition = definePublicError({
  code: 'PROJECT_NOT_FOUND',
  type: ErrorType.NOT_FOUND,
  detailsSchema: z.object({ id: z.string() }),
})

const projectNameAlreadyExistsErrorDefinition = definePublicError({
  code: 'PROJECT_NAME_ALREADY_EXISTS',
  type: ErrorType.CONFLICT,
  detailsSchema: z.object({ name: z.string() }),
})

const projectLockedErrorDefinition = definePublicError({
  code: 'PROJECT_LOCKED',
  type: ErrorType.CONFLICT,
})

describe('mergeErrorSchemasByStatusCode', () => {
  it('returns an empty object for no definitions', () => {
    expect(mergeErrorSchemasByStatusCode([])).toEqual({})
  })

  it('maps a lone definition to its schema as-is', () => {
    const responses = mergeErrorSchemasByStatusCode([projectNotFoundErrorDefinition])
    expect(responses[404]).toBe(projectNotFoundErrorDefinition.schema)
  })

  it('groups definitions under the status code derived from their type', () => {
    const responses = mergeErrorSchemasByStatusCode([
      projectNotFoundErrorDefinition,
      projectNameAlreadyExistsErrorDefinition,
      projectLockedErrorDefinition,
    ])
    expect(Object.keys(responses).sort()).toEqual(['404', '409'])
  })

  it('combines definitions sharing a status code into a discriminated union on code', () => {
    const responses = mergeErrorSchemasByStatusCode([
      projectNameAlreadyExistsErrorDefinition,
      projectLockedErrorDefinition,
    ])

    expect(
      responses[409].safeParse({
        message: 'conflict',
        code: 'PROJECT_NAME_ALREADY_EXISTS',
        details: { name: 'foo' },
      }).success,
    ).toBe(true)
    expect(responses[409].safeParse({ message: 'locked', code: 'PROJECT_LOCKED' }).success).toBe(
      true,
    )
    expect(responses[409].safeParse({ message: 'conflict', code: 'UNRELATED_CODE' }).success).toBe(
      false,
    )
    expect(
      // details required by the matched union member
      responses[409].safeParse({ message: 'conflict', code: 'PROJECT_NAME_ALREADY_EXISTS' })
        .success,
    ).toBe(false)
  })

  it('accepts toPayload output of a matching error class', () => {
    class ProjectNameAlreadyExistsError extends PublicError.from(
      projectNameAlreadyExistsErrorDefinition,
    ) {
      constructor(name: string) {
        super({ message: `A project named "${name}" already exists.`, details: { name } })
      }
    }

    const responses = mergeErrorSchemasByStatusCode([
      projectNameAlreadyExistsErrorDefinition,
      projectLockedErrorDefinition,
    ])
    expect(
      responses[409].safeParse(new ProjectNameAlreadyExistsError('foo').toPayload()).success,
    ).toBe(true)
  })

  it('preserves literal status code keys and payload types', () => {
    const responses = mergeErrorSchemasByStatusCode([
      projectNotFoundErrorDefinition,
      projectNameAlreadyExistsErrorDefinition,
      projectLockedErrorDefinition,
    ])

    type NotFoundPayload = z.infer<(typeof responses)[404]>
    const notFoundCode: NotFoundPayload['code'] = 'PROJECT_NOT_FOUND'
    const notFoundDetails: NotFoundPayload['details'] = { id: 'abc' }
    expect(notFoundCode).toBe('PROJECT_NOT_FOUND')
    expect(notFoundDetails).toEqual({ id: 'abc' })

    type ConflictPayload = z.infer<(typeof responses)[409]>
    const conflictCode: ConflictPayload['code'] = 'PROJECT_LOCKED'
    expect(conflictCode).toBe('PROJECT_LOCKED')

    const accessMissingStatusCode = () => {
      // @ts-expect-error — 500 is not a status code of any provided definition
      return responses[500]
    }
    expect(accessMissingStatusCode()).toBeUndefined()
  })
})
