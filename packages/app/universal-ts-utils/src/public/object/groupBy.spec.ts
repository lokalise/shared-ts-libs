import { describe, expect, it } from 'vitest'
import { groupBy } from './groupBy.js'

describe('groupBy', () => {
  it('Empty array', () => {
    const array: { id: string }[] = []
    const result = groupBy(array, 'id')
    expect(Object.keys(result)).length(0)
  })

  type TestType = {
    id?: number | null
    name: string
    bool: boolean
    nested?: {
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
        name: 'c',
        bool: true,
        nested: { code: 200 },
      },
      {
        id: 3,
        name: 'b',
        bool: true,
        nested: { code: 300 },
      },
      {
        id: 4,
        name: 'a',
        bool: true,
        nested: { code: 400 },
      },
    ]

    const result: Record<string, TestType[]> = groupBy(input, 'name')
    expect(result).toStrictEqual({
      a: [
        {
          id: 1,
          name: 'a',
          bool: true,
          nested: { code: 100 },
        },
        {
          id: 4,
          name: 'a',
          bool: true,
          nested: { code: 400 },
        },
      ],
      b: [
        {
          id: 3,
          name: 'b',
          bool: true,
          nested: { code: 300 },
        },
      ],
      c: [
        {
          id: 2,
          name: 'c',
          bool: true,
          nested: { code: 200 },
        },
      ],
    })
  })

  it('Correctly groups by number values', () => {
    const input: TestType[] = [
      {
        id: 1,
        name: 'a',
        bool: true,
      },
      {
        id: 1,
        name: 'b',
        bool: false,
      },
      {
        id: 2,
        name: 'c',
        bool: false,
      },
      {
        id: 3,
        name: 'd',
        bool: false,
      },
    ]

    const result: Record<number, TestType[]> = groupBy(input, 'id')

    expect(result).toStrictEqual({
      1: [
        {
          id: 1,
          name: 'a',
          bool: true,
        },
        {
          id: 1,
          name: 'b',
          bool: false,
        },
      ],
      2: [
        {
          id: 2,
          name: 'c',
          bool: false,
        },
      ],
      3: [
        {
          id: 3,
          name: 'd',
          bool: false,
        },
      ],
    })
  })

  it('Correctly handles undefined and null', () => {
    const input: TestType[] = [
      {
        id: 1,
        name: 'a',
        bool: true,
      },
      {
        name: 'c',
        bool: true,
      },
      {
        id: null,
        name: 'd',
        bool: true,
      },
      {
        id: 1,
        name: 'b',
        bool: true,
      },
    ]

    const result = groupBy(input, 'id')

    expect(result).toStrictEqual({
      1: [
        {
          id: 1,
          name: 'a',
          bool: true,
        },
        {
          id: 1,
          name: 'b',
          bool: true,
        },
      ],
    })
  })
})
