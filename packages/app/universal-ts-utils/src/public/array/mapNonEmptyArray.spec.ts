import { describe, expect, it } from 'vitest'
import { mapNonEmptyArray } from './mapNonEmptyArray.js'
import type { NonEmptyArray } from './nonEmptyArray.js'

describe('mapNonEmptyArray', () => {
  it('maps over a non-empty array and applies the mapper function', () => {
    const input: NonEmptyArray<number> = [1, 2, 3]
    const result = mapNonEmptyArray(input, (x) => x * 2)
    expect(result).toEqual([2, 4, 6])
  })

  it('preserves the non-empty array type after mapping', () => {
    const input: NonEmptyArray<string> = ['a', 'b', 'c']
    const result = mapNonEmptyArray(input, (x) => x.toUpperCase())
    const _: NonEmptyArray<string> = result // Type check
    expect(result).toEqual(['A', 'B', 'C'])
  })

  it('works with arrays of a single element', () => {
    const input: NonEmptyArray<number> = [42]
    const result = mapNonEmptyArray(input, (x) => x + 1)
    expect(result).toEqual([43])
  })

  it('works with complex transformations', () => {
    const input: NonEmptyArray<{ value: number }> = [{ value: 1 }, { value: 2 }]
    const result = mapNonEmptyArray(input, (x) => x.value * 2)
    expect(result).toEqual([2, 4])
  })
})
