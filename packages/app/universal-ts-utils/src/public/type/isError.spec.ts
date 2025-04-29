import { describe, expect, it } from 'vitest'
import { isError } from './isError.ts'

describe('isError', () => {
  it('true for Error', () => {
    const error = new Error('')

    expect(isError(error)).toBe(true)
  })

  it('true for Error extension', () => {
    class MyError extends Error {}
    const error = new MyError('')

    expect(isError(error)).toBe(true)
  })

  it('true for Error', () => {
    const error = new Error('bam')

    expect(isError(error)).toBe(true)
  })

  it('false for string', () => {
    const error = 'bam'

    expect(isError(error)).toBe(false)
  })

  it('false for a number', () => {
    const error = 43

    expect(isError(error)).toBe(false)
  })

  it('false for a plain object', () => {
    const error = {}

    expect(isError(error)).toBe(false)
  })
})
