import { describe, expect, it } from 'vitest'
import { removeFalsy } from './removeFalsy'

describe('arrayUtils', () => {
  describe('removeFalsy', () => {
    it('should remove all falsy values', () => {
      const array = ['', false, null, 'valid', 1, undefined, 0]
      const result: (string | number | boolean)[] = removeFalsy(array)
      expect(result).toEqual(['valid', 1])
    })
  })
})
