import { describe, expect, it } from 'vitest'
import { sort } from './sort'

describe('sort', () => {
  it('sorts numbers in ascending order by default', () => {
    expect(sort([2, 1, 4, 3, 50, 30])).toStrictEqual([1, 2, 3, 4, 30, 50])
  })

  it('sorts numbers in descending order', () => {
    expect(sort([2, 1, 4, 3, 50, 30], 'desc')).toStrictEqual([50, 30, 4, 3, 2, 1])
  })

  it('sorts strings', () => {
    const array = ['b', 'a', 'aa']
    expect(sort(array)).toStrictEqual(['a', 'aa', 'b'])
    expect(sort(array, 'desc')).toStrictEqual(['b', 'aa', 'a'])
  })

  it('sorts a mixed array of strings and numbers', () => {
    const array = [10, '2', '1', 3, 'hello']
    expect(sort(array)).toStrictEqual(['1', '2', 3, 10, 'hello'])
    expect(sort(array, 'desc')).toStrictEqual(['hello', 10, 3, '2', '1'])
  })

  it('handles sorting of boolean values', () => {
    const array = [true, false, true]
    expect(sort(array)).toStrictEqual([false, true, true])
    expect(sort(array, 'desc')).toStrictEqual([true, true, false])
  })

  it('handles mixed values of different types', () => {
    const array = [true, 2, '1', false]
    expect(sort(array)).toStrictEqual([false, true, '1', 2])
    expect(sort(array, 'desc')).toStrictEqual([2, '1', true, false])
  })

  it('handles null', () => {
    const array = [false, 0, null]
    expect(sort(array)).toStrictEqual([null, false, 0])
    expect(sort(array, 'desc')).toStrictEqual([0, false, null])
  })
})
