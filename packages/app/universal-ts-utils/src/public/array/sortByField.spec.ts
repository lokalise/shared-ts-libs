import { describe, expect, it } from 'vitest'
import { sortByField } from './sortByField.ts'

describe('sortByField', () => {
  it('should handle an empty array without throwing errors', () => {
    const data: { age: number }[] = []
    const sortedData = sortByField(data, 'age')
    expect(sortedData).toEqual([])
  })

  it('should do nothing if field does not exists', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]
    expect(sortByField(data, 'nonExistentField' as any)).toEqual(data)
  })

  it('should handle arrays with a single element', () => {
    const data = [{ name: 'single', age: 40 }]
    const sortedData = sortByField(data, 'age')
    expect(sortedData).toEqual([{ name: 'single', age: 40 }])
  })

  it('original array is not mutated', () => {
    const array = [{ age: 2 }, { age: 1 }, { age: 3 }]
    const sortedArray = sortByField(array, 'age')
    expect(array).toStrictEqual([{ age: 2 }, { age: 1 }, { age: 3 }])
    expect(sortedArray).toStrictEqual([{ age: 1 }, { age: 2 }, { age: 3 }])
  })

  describe('number', () => {
    it('should sort objects based on a numeric field', () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 22 },
      ]
      expect(sortByField(data, 'age')).toEqual([
        { name: 'Charlie', age: 22 },
        { name: 'Bob', age: 25 },
        { name: 'Alice', age: 30 },
      ])
      expect(sortByField(data, 'age', 'desc')).toEqual([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 22 },
      ])
    })

    it('should correctly handle sorting fields with the same numeric value', () => {
      const data = [
        { name: 'Duplicate', age: 25 },
        { name: 'Duplicate2', age: 25 },
        { name: 'Unique', age: 30 },
      ]
      expect(sortByField(data, 'age')).toEqual([
        { name: 'Duplicate', age: 25 },
        { name: 'Duplicate2', age: 25 },
        { name: 'Unique', age: 30 },
      ])
    })
  })

  describe('string', () => {
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

    it('should perform a correct case-insensitive sort', () => {
      const data = [{ name: 'apple' }, { name: 'Banana' }, { name: 'cherry' }]
      expect(sortByField(data, 'name')).toEqual([
        { name: 'apple' },
        { name: 'Banana' },
        { name: 'cherry' },
      ])
    })

    it('should correctly handle sorting fields with the same value', () => {
      const data = [{ name: 'alpha' }, { name: 'alpha' }, { name: 'beta' }]
      expect(sortByField(data, 'name')).toEqual([
        { name: 'alpha' },
        { name: 'alpha' },
        { name: 'beta' },
      ])
    })
  })
})
