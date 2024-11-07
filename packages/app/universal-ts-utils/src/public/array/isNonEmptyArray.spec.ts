import { describe, expect, it } from 'vitest'
import { isNonEmptyArray } from './isNonEmptyArray.js'

describe('arrayUtils', () => {
  describe('isNonEmptyArray', () => {
    it('returns false if array is empty ', () => {
      expect(isNonEmptyArray([])).toBe(false)
    })

    it('returns true if array is not empty', () => {
      expect(isNonEmptyArray(['hello', 'world'])).toBe(true)
    })

    it('type guard works', () => {
      const array = [1, 2, 3]
      if (!isNonEmptyArray(array)) throw new Error('Array should not be empty')

      // Ensure the type is inferred correctly at compile-time
      type Assert<T, Expected> = T extends Expected ? true : false
      type Check = Assert<typeof array, [number, ...number[]]>
      const isCorrectType: Check = true // If this line fails, type guard is not working
      expect(isCorrectType).toBe(true)
    })
  })
})
