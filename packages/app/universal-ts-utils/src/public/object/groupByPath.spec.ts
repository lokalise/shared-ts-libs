import { describe, expect, it } from 'vitest'
import { groupByPath } from './groupByPath.ts'

describe('groupByPath', () => {
  it('Empty array', () => {
    const array: { id: { nestedId: string } }[] = []
    const result = groupByPath(array, 'id.nestedId')
    expect(Object.keys(result)).length(0)
  })

  type TestType = {
    id?: number | null
    name: string
    bool: boolean
    symbol?: symbol
    nested?: {
      code: number
    }
  }

  type TestType1 = {
    id?: number | null
    name: string
    bool: boolean
    nested?: {
      code: number
    }[]
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

    const result: Record<string, TestType[]> = groupByPath(input, 'name')
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

  it('Correctly groups by nested string values', () => {
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
        nested: { code: 100 },
      },
    ]

    const result: Record<string, TestType[]> = groupByPath(input, 'nested.code')
    expect(result).toStrictEqual({
      100: [
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
          nested: { code: 100 },
        },
      ],
      300: [
        {
          id: 3,
          name: 'b',
          bool: true,
          nested: { code: 300 },
        },
      ],
      200: [
        {
          id: 2,
          name: 'c',
          bool: true,
          nested: { code: 200 },
        },
      ],
    })
  })

  it('return empty record for nested array key', () => {
    const input: TestType1[] = [
      {
        id: 1,
        name: 'a',
        bool: true,
        nested: [{ code: 100 }],
      },
    ]

    const result: Record<string, TestType1[]> = groupByPath(input, 'nested.code')
    expect(result).toStrictEqual({})
  })

  it('Correctly groups by number values', () => {
    const symbolA = Symbol('a')
    const symbolB = Symbol('b')
    const input: TestType[] = [
      {
        id: 1,
        name: 'a',
        bool: true,
        symbol: symbolA,
      },
      {
        id: 2,
        name: 'c',
        bool: false,
        symbol: symbolB,
      },
      {
        id: 3,
        name: 'd',
        bool: false,
        symbol: symbolA,
      },
    ]

    const result: Record<number, TestType[]> = groupByPath(input, 'symbol')

    expect(result).toStrictEqual({
      [symbolA]: [
        {
          id: 1,
          name: 'a',
          bool: true,
          symbol: symbolA,
        },
        {
          id: 3,
          name: 'd',
          bool: false,
          symbol: symbolA,
        },
      ],
      [symbolB]: [
        {
          id: 2,
          name: 'c',
          bool: false,
          symbol: symbolB,
        },
      ],
    })
  })

  it('Correctly groups by symbol values', () => {
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

    const result: Record<number, TestType[]> = groupByPath(input, 'id')

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

    const result = groupByPath(input, 'id')

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
