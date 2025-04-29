import { describe, expect, it } from 'vitest'
import { defineNonEmptyArray } from './defineNonEmptyArray.ts'
import type { NonEmptyArray } from './nonEmptyArray.ts'

describe('defineNonEmptyArray', () => {
  it('should infer the type as NonEmptyArray', () => {
    const arr = defineNonEmptyArray([1])

    const _: NonEmptyArray<number> = arr // Type check
    expect(arr[0]).toBe(1)
  })
})
