import { describe, expect, it } from 'vitest'
import { isObject } from './isObject.js'

describe('isObject', () => {
  it('true for object', () => {
    const error = new Error('error')

    expect(isObject(error)).toBe(true)
  })

  it('false for non-object', () => {
    const error = 'error'

    expect(isObject(error)).toBe(false)
  })

  it('false for null', () => {
    const error = null

    expect(isObject(error)).toBe(false)
  })
})
