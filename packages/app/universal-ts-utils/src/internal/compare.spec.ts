import { describe, expect, it } from 'vitest'
import { compare } from './compare.ts'

describe('compare', () => {
  it('should correctly compare two strings', () => {
    expect(compare('apple', 'banana')).toBeLessThan(0)
    expect(compare('orange', 'orange')).toBe(0)
    expect(compare('zebra', 'apple')).toBeGreaterThan(0)
  })

  it('should correctly compare two numbers', () => {
    expect(compare(1, 2)).toBeLessThan(0)
    expect(compare(10, 10)).toBe(0)
    expect(compare(15, 5)).toBeGreaterThan(0)
  })

  it('should handle comparison of same strings', () => {
    expect(compare('test', 'test')).toBe(0)
  })

  it('should handle comparison of same numbers', () => {
    expect(compare(42, 42)).toBe(0)
  })

  it('should handle comparison with empty strings', () => {
    expect(compare('', 'a')).toBeLessThan(0)
    expect(compare('a', '')).toBeGreaterThan(0)
    expect(compare('', '')).toBe(0)
  })
})
