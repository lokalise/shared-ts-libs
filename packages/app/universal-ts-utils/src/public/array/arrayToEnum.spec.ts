import { describe, expect, expectTypeOf, it } from 'vitest'
import { arrayToEnum } from './arrayToEnum.ts'

describe('arrayToEnum', () => {
  it('converts an array of strings into an enum-like object', () => {
    const fruits = ['apple', 'banana', 'orange'] as const
    const result = arrayToEnum(fruits)

    expect(result).toEqual({
      apple: 'apple',
      banana: 'banana',
      orange: 'orange',
    })
    expectTypeOf(result).toEqualTypeOf<{
      apple: 'apple'
      banana: 'banana'
      orange: 'orange'
    }>()
  })

  it('handles an empty array', () => {
    const emptyArray = [] as const
    const result = arrayToEnum(emptyArray)

    expect(result).toEqual({})
    // biome-ignore lint/complexity/noBannedTypes: Test type
    expectTypeOf(result).toEqualTypeOf<{}>()
  })

  it('ignores repetitions', () => {
    const fruits = ['apple', 'banana', 'apple'] as const
    const result = arrayToEnum(fruits)

    expect(result).toEqual({
      apple: 'apple',
      banana: 'banana',
    })
    expectTypeOf(result).toEqualTypeOf<{
      apple: 'apple'
      banana: 'banana'
    }>()
  })
})
