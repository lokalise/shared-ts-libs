import { describe, expect, it } from 'vitest'
import { sort } from './sort.js'

describe('sort', () => {
  it('is able to handle empty arrays', () => {
    expect(sort([])).toStrictEqual([])
  })

  it('is able to handle arrays with 1 element', () => {
    expect(sort([1])).toStrictEqual([1])
  })

  it('original array is not mutated', () => {
    const array = [2, 1, 3]
    const sortedArray = sort(array)

    expect(array).toStrictEqual([2, 1, 3])
    expect(sortedArray).toStrictEqual([1, 2, 3])
  })

  it('sorts numbers in ascending order by default', () => {
    const array = [2, 1, 4, 3, 50, 30]
    expect(sort(array)).toStrictEqual([1, 2, 3, 4, 30, 50])
    expect(sort(array, 'desc')).toStrictEqual([50, 30, 4, 3, 2, 1])
  })

  it('sorts strings', () => {
    const array = ['b', 'a', 'aa']
    expect(sort(array)).toStrictEqual(['a', 'aa', 'b'])
    expect(sort(array, 'desc')).toStrictEqual(['b', 'aa', 'a'])
  })
})
