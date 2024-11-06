import { describe, expect, it } from 'vitest'
import { areStringArraysEqual } from './areStringArraysEqual'

describe('areStringArraysEqual', () => {
  it('returns true for identical arrays', () => {
    const array1 = ['a', 'b', 'c']
    const array2 = ['a', 'b', 'c']
    const result = areStringArraysEqual(array1, array2)
    expect(result).toBe(true)
  })

  it('returns false for arrays of different lengths', () => {
    const array1 = ['a', 'b', 'c']
    const array2 = ['a', 'b']
    const result = areStringArraysEqual(array1, array2)
    expect(result).toBe(false)
  })

  it('returns false for arrays with different elements', () => {
    const array1 = ['a', 'b', 'c']
    const array2 = ['a', 'b', 'd']
    const result = areStringArraysEqual(array1, array2)
    expect(result).toBe(false)
  })

  it('returns true for empty arrays', () => {
    const array1: string[] = []
    const array2: string[] = []
    const result = areStringArraysEqual(array1, array2)
    expect(result).toBe(true)
  })

  it('returns false for arrays with same elements in different order', () => {
    const array1 = ['a', 'b', 'c']
    const array2 = ['c', 'b', 'a']
    const result = areStringArraysEqual(array1, array2)
    expect(result).toBe(false)
  })

  it('returns false for arrays with duplicated elements', () => {
    const array1 = ['a', 'b', 'c']
    const array2 = ['a', 'b', 'b', 'c']
    const result = areStringArraysEqual(array1, array2)
    expect(result).toBe(false)

    const reverseResult = areStringArraysEqual(array2, array1)
    expect(reverseResult).toBe(false)
  })
})
