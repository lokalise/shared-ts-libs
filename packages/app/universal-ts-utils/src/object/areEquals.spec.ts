import { describe, expect, it } from 'vitest'
import { areEquals } from './areEquals'

// TODO: add more tests
describe('areEquals', () => {
  describe('comparing arrays', () => {
    it('comparing string arrays', () => {
      const a = ['a', 'b', 'c']
      const b = ['a', 'd', 'c']
      const c = ['a', 'b', 'c']
      expect(areEquals(a, b)).toBe(false)
      expect(areEquals(a, c)).toBe(false)
    })

    it('comparing number arrays', () => {
      const a = [1, 2, 3]
      const b = [1, 4, 3]
      const c = [1, 2, 3]
      expect(areEquals(a, b)).toBe(false)
      expect(areEquals(a, c)).toBe(true)
    })

    it('comparing objects in array', () => {
      const object1 = { hello: 'world' }
      const object2 = { hello: 'world' }

      const a = [object1, object2]
      const b = [object1, { hello: 'world' }]
      const c = [object1, object2]
      expect(areEquals(a, b)).toBe(true)
      expect(areEquals(a, c)).toBe(true)
    })
  })
})
