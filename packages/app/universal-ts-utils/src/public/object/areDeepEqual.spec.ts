import { describe, expect, it } from 'vitest'
import { areDeepEqual } from './areDeepEqual.js'

describe('areDeepEqual', () => {
  describe('comparing primitives', () => {
    it('integer and floating-point numbers', () => {
      expect(areDeepEqual(1, 1)).toBe(true)
      expect(areDeepEqual(1, 1.0)).toBe(true) // Treating integer and float equivalently
      expect(areDeepEqual(1, 2)).toBe(false)
    })

    it('strings', () => {
      expect(areDeepEqual('hello', 'hello')).toBe(true)
      expect(areDeepEqual('hello', 'world')).toBe(false)
    })

    it('booleans', () => {
      expect(areDeepEqual(true, true)).toBe(true)
      expect(areDeepEqual(true, false)).toBe(false)
    })

    it('null and undefined', () => {
      expect(areDeepEqual(null, null)).toBe(true)
      expect(areDeepEqual(undefined, undefined)).toBe(true)
      expect(areDeepEqual(null, undefined)).toBe(false)
      expect(areDeepEqual(undefined, null)).toBe(false)
    })
  })

  describe('comparing objects', () => {
    it('simple objects', () => {
      const a = { x: 1, y: 2 }
      const b = { x: 1, z: 2 }
      const c = { x: 1, y: 2 }
      expect(areDeepEqual(a, b)).toBe(false)
      expect(areDeepEqual(a, c)).toBe(true)
    })

    it('nested objects', () => {
      const a = { x: { y: { z: 1 } } }
      const b = { x: { y: { z: 2 } } }
      const c = { x: { y: { z: 1 } } }
      expect(areDeepEqual(a, b)).toBe(false)
      expect(areDeepEqual(a, c)).toBe(true)
    })

    it('null and undefined', () => {
      const a = { x: null, y: undefined }
      const b = { x: null, y: undefined }
      const c = { x: undefined, y: null }
      expect(areDeepEqual(a, b)).toBe(true)
      expect(areDeepEqual(a, c)).toBe(false)
    })
  })

  describe('comparing arrays', () => {
    it('different array sizes', () => {
      const a = [1, 2]
      const b = [1, 2, 3]
      expect(areDeepEqual(a, b)).toBe(false)
    })

    it('comparing string arrays', () => {
      const a = ['a', 'b', 'c']
      const b = ['a', 'd', 'c']
      const c = ['a', 'b', 'c']
      expect(areDeepEqual(a, b)).toBe(false)
      expect(areDeepEqual(a, c)).toBe(true)
    })

    it('comparing number arrays', () => {
      const a = [1, 2, 3]
      const b = [1, 4, 3]
      const c = [1, 2, 3]
      expect(areDeepEqual(a, b)).toBe(false)
      expect(areDeepEqual(a, c)).toBe(true)
    })

    it('comparing objects in array', () => {
      const object1 = { hello: 'world' }
      const object2 = { hello: 'world' }
      const a = [object1, object2]
      const b = [object1, { hello: 'world' }]
      const c = [object1, object2]
      expect(areDeepEqual(a, b)).toBe(true) // Objects with the same content should be equal
      expect(areDeepEqual(a, c)).toBe(true)
    })

    it('nested arrays and objects', () => {
      const a = [{ arr: [1, 2, 3], obj: { a: 'b' } }]
      const b = [{ arr: [1, 2, 4], obj: { a: 'b' } }]
      const c = [{ arr: [1, 2, 3], obj: { a: 'b' } }]
      expect(areDeepEqual(a, b)).toBe(false)
      expect(areDeepEqual(a, c)).toBe(true)
    })
  })
})
