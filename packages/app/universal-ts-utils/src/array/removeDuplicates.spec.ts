import { describe, expect, it } from 'vitest'
import { removeDuplicates } from './removeDuplicates'

describe('removeDuplicates', () => {
  describe('removeDuplicates', () => {
    it('should remove all duplicates', () => {
      const array = [0, 0, 1, '', '', 'test', true, true, false]
      const result = removeDuplicates(array)
      expect(result).toEqual([0, 1, '', 'test', true, false])
    })
  })
})
