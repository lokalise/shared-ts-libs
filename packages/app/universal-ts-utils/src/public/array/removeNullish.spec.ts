import { describe, expect, it } from 'vitest'
import { removeNullish } from './removeNullish.js'

describe('arrayUtils', () => {
  describe('removeNullish', () => {
    it('should remove only null and undefined', () => {
      const array = ['', false, null, 'valid', 1, undefined, 0]
      const result: (string | number | boolean)[] = removeNullish(array)
      expect(result).toEqual(['', false, 'valid', 1, 0])
    })
  })
})
