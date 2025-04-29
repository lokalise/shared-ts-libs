import { describe, expect, it } from 'vitest'
import { uniqueByProperty } from './uniqueByProperty.ts'

describe('uniqueByProperty', () => {
  it('should remove duplicates by string property', () => {
    const input = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'a', value: 3 },
      { id: 'c', value: 4 },
    ]

    const result = uniqueByProperty(input, 'id')

    expect(result).toEqual([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 4 },
    ])
  })

  it('should remove duplicates by number property', () => {
    const input = [
      { count: 1, name: 'first' },
      { count: 2, name: 'second' },
      { count: 1, name: 'third' },
    ]

    const result = uniqueByProperty(input, 'count')

    expect(result).toEqual([
      { count: 1, name: 'first' },
      { count: 2, name: 'second' },
    ])
  })

  it('should handle empty array', () => {
    const input: Array<{ id: string }> = []
    const result = uniqueByProperty(input, 'id')
    expect(result).toEqual([])
  })

  it('should preserve first occurrence of duplicate', () => {
    const input = [
      { id: 'a', value: 1 },
      { id: 'a', value: 2 },
      { id: 'a', value: 3 },
    ]

    const result = uniqueByProperty(input, 'id')

    expect(result).toEqual([{ id: 'a', value: 1 }])
  })

  it('should handle array with no duplicates', () => {
    const input = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 3 },
    ]

    const result = uniqueByProperty(input, 'id')

    expect(result).toEqual(input)
  })
})
