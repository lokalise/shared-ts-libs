import { describe, expect, expectTypeOf, it } from 'vitest'
import { concatObjectValues } from './concatObjectValues.ts'

describe('concatObjectValues', () => {
  it('concatenates the values of multiple objects into a single array', () => {
    const first = { a: 'a1', b: 'b1' }
    const second = { c: 'c1' }
    const third = { d: 'd1', e: 'e1' }

    const result = concatObjectValues([first, second, third])

    expect(result).toEqual(['a1', 'b1', 'c1', 'd1', 'e1'])
  })

  it('returns the values of a single object', () => {
    const only = { a: 1, b: 2 }

    const result = concatObjectValues([only])

    expect(result).toEqual([1, 2])
  })

  it('returns an empty array when given no objects', () => {
    const result = concatObjectValues([])

    expect(result).toEqual([])
  })

  it('returns the values typed as the union of every object value', () => {
    const events = { created: { name: 'created' as const } }
    const processes = { started: { name: 'started' as const } }

    const result = concatObjectValues([events, processes])

    expectTypeOf(result).toEqualTypeOf<({ name: 'created' } | { name: 'started' })[]>()
  })
})
