import { describe, expect, it } from 'vitest'
import { isStandardizedError } from './isStandardizedError.ts'

describe('isStandardizedError', () => {
  it('true for standardized error', () => {
    const error = {
      message: 'dummy',
      code: 'code',
    }

    expect(isStandardizedError(error)).toBe(true)
  })

  it('false for non standardized error', () => {
    const error = new Error()

    expect(isStandardizedError(error)).toBe(false)
  })
})
