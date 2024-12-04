import { describe, expect, it } from 'vitest'
import { isEmpty } from './isEmpty.js'

describe('isEmpty', () => {
  it('Returns true for completely empty object', () => {
    const params = {}
    const result = isEmpty(params)
    expect(result).toBe(true)
  })

  it('Returns true for object with only undefined fields', () => {
    const params = { a: undefined }
    const result = isEmpty(params)
    expect(result).toBe(true)
  })

  it('Returns false for object with null', () => {
    const params = { a: null }
    const result = isEmpty(params)
    expect(result).toBe(false)
  })

  it('Returns false for non-empty object', () => {
    const params = { a: '' }
    const result = isEmpty(params)
    expect(result).toBe(false)
  })

  it('handle arrays', () => {
    const emptyArray = []
    expect(isEmpty(emptyArray)).toBe(true)

    const array1 = [{ a: 'a' }, { a: 'b' }, { a: null }]
    expect(isEmpty(array1)).toBe(false)

    const array2 = [{ a: 'a' }, {}, { a: undefined }]
    expect(isEmpty(array2)).toBe(false)

    const array3 = [{}, { a: undefined }]
    expect(isEmpty(array3)).toBe(true)
  })
})
