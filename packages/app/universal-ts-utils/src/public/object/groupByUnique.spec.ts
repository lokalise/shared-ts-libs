import { describe, expect, it } from 'vitest'
import { groupByUnique } from './groupByUnique.ts'

describe('groupByUnique', () => {
  it('Empty array', () => {
    const array: { id: string }[] = []
    const result = groupByUnique(array, 'id')
    expect(Object.keys(result)).length(0)
  })

  type TestType = {
    id?: number | null
    name: string
    bool: boolean
    nested: {
      code: number
    }
  }

  it('Correctly groups by string values', () => {
    const input: TestType[] = [
      {
        id: 1,
        name: 'a',
        bool: true,
        nested: { code: 100 },
      },
      {
        id: 2,
        name: 'b',
        bool: true,
        nested: { code: 200 },
      },
    ]

    const result: Record<string, TestType> = groupByUnique(input, 'name')
    expect(result).toStrictEqual({
      a: {
        id: 1,
        name: 'a',
        bool: true,
        nested: { code: 100 },
      },

      b: {
        id: 2,
        name: 'b',
        bool: true,
        nested: { code: 200 },
      },
    })
  })

  it('Correctly groups by number values', () => {
    const input: TestType[] = [
      {
        id: 1,
        name: 'a',
        bool: true,
        nested: { code: 100 },
      },
      {
        id: 2,
        name: 'b',
        bool: true,
        nested: { code: 200 },
      },
    ]

    const result: Record<number, TestType> = groupByUnique(input, 'id')

    expect(result).toStrictEqual({
      1: {
        id: 1,
        name: 'a',
        bool: true,
        nested: { code: 100 },
      },
      2: {
        id: 2,
        name: 'b',
        bool: true,
        nested: { code: 200 },
      },
    })
  })

  it('Correctly handles undefined', () => {
    const input: TestType[] = [
      {
        id: 1,
        name: 'name',
        bool: true,
        nested: { code: 100 },
      },
      {
        name: 'invalid',
        bool: true,
        nested: { code: 100 },
      },
      {
        id: 3,
        name: 'name 2',
        bool: true,
        nested: { code: 100 },
      },
    ]

    const result = groupByUnique(input, 'id')

    expect(result).toStrictEqual({
      1: {
        id: 1,
        name: 'name',
        bool: true,
        nested: { code: 100 },
      },
      3: {
        id: 3,
        name: 'name 2',
        bool: true,
        nested: { code: 100 },
      },
    })
  })

  it('throws on duplicated value', () => {
    const input: { name: string }[] = [
      {
        id: 1,
        name: 'test',
      },
      {
        id: 2,
        name: 'work',
      },
      {
        id: 3,
        name: 'test',
      },
    ] as never[]

    expect(() => groupByUnique(input, 'name')).toThrowError(
      'Duplicated item for selector name with value test',
    )
  })
})
