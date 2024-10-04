import { describe, expect, it } from 'vitest'
import { sortByField } from './sortByField'

describe('sortByField', () => {
  it('should handle an empty array without throwing errors', () => {
    const data: { name: string }[] = []
    const sortedData = sortByField(data, 'name')

    expect(sortedData).toEqual([])
  })

  it('should sort objects based string field', () => {
    const data = [
      { name: 'Zara', age: 22 },
      { name: 'Alex', age: 30 },
      { name: 'John', age: 25 },
    ]

    expect(sortByField(data, 'name')).toEqual([
      { name: 'Alex', age: 30 },
      { name: 'John', age: 25 },
      { name: 'Zara', age: 22 },
    ])
    expect(sortByField(data, 'name', 'desc')).toEqual([
      { name: 'Zara', age: 22 },
      { name: 'John', age: 25 },
      { name: 'Alex', age: 30 },
    ])
  })

  it('should throw if field is not a string', () => {
    const data = [
      { name: 'Charlie', age: 22 },
      { name: 'Bob', age: 25 },
    ]

    // @ts-expect-error Testing for incorrect field type
    expect(() => sortByField(data, 'age')).toThrow()
  })

  it('should throw an error if string field does not exist', () => {
    const data = [
      { name: 'Charlie', age: 22 },
      { name: 'Bob', age: 25 },
    ]

    expect(() => sortByField(data, 'nonExistentField' as any)).toThrow()
  })

  it('should perform a correct case-insensitive sort', () => {
    const data = [{ name: 'apple' }, { name: 'Banana' }, { name: 'cherry' }]

    const sortedData = sortByField(data, 'name')

    expect(sortedData).toEqual([{ name: 'apple' }, { name: 'Banana' }, { name: 'cherry' }])
  })

  it('should correctly handle sorting fields with the same value', () => {
    const data = [{ name: 'alpha' }, { name: 'alpha' }, { name: 'beta' }]

    const sortedData = sortByField(data, 'name')

    expect(sortedData).toEqual([{ name: 'alpha' }, { name: 'alpha' }, { name: 'beta' }])
  })

  it('should handle arrays with a single element', () => {
    const data = [{ name: 'single', age: 40 }]

    const sortedData = sortByField(data, 'name')

    expect(sortedData).toEqual([{ name: 'single', age: 40 }])
  })
})
