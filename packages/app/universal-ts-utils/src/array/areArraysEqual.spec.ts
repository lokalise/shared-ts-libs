import { describe, expect, it } from 'vitest'
import { areArraysEqual } from './areArraysEqual'

// TODO: add more and better tests
describe('areArraysEqual', () => {
  it('comparing string arrays', () => {
    const a = ['a', 'b', 'c']
    const b = ['a', 'd', 'c']
    const c = ['a', 'b', 'c']
    expect(areArraysEqual(a, b)).toBe(false)
    expect(areArraysEqual(a, c)).toBe(false)
  })

  it('comparing number arrays', () => {
    const a = [1, 2, 3]
    const b = [1, 4, 3]
    const c = [1, 2, 3]
    expect(areArraysEqual(a, b)).toBe(false)
    expect(areArraysEqual(a, c)).toBe(true)
  })

  it('comparing objects', () => {
    // Objects are compared by reference, so they should be the same on memory
    const object1 = { hello: 'world' }
    const object2 = { hello: 'world' }

    const a = [object1, object2]
    const b = [object1, { hello: 'world' }]
    const c = [object1, object2]
    expect(areArraysEqual(a, b)).toBe(true)
    expect(areArraysEqual(a, c)).toBe(true)
  })
})
