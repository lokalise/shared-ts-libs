import { describe, expect, it } from 'vitest'
import { convertDateFieldsToIsoString } from './convertDateFieldsToIsoString.ts'

type TestInputType = {
  id: number
  value: string
  date: Date
  code: number
  reason?: string | null
  other?: TestInputType
  array?: {
    id: number
    createdAt: Date
  }[]
}

type TestExpectedType = {
  id: number
  value: string
  date: string
  code: number
  other?: TestExpectedType
  array?: {
    id: number
    createdAt: string
  }[]
}

describe('convertDateFieldsToIsoString', () => {
  it('empty object', () => {
    expect(convertDateFieldsToIsoString({})).toStrictEqual({})
  })

  it('simple object', () => {
    const date = new Date()
    const input: TestInputType = {
      id: 1,
      date,
      value: 'test',
      reason: 'reason',
      code: 100,
    }

    const output: TestExpectedType = convertDateFieldsToIsoString(input)

    expect(output).toStrictEqual({
      id: 1,
      date: date.toISOString(),
      value: 'test',
      code: 100,
      reason: 'reason',
    })
  })

  it('simple array', () => {
    const date1 = new Date()
    const date2 = new Date()
    const input: TestInputType[] = [
      {
        id: 1,
        date: date1,
        value: 'test',
        reason: 'reason',
        code: 100,
      },
      {
        id: 2,
        date: date2,
        value: 'test 2',
        reason: 'reason 2',
        code: 200,
      },
    ]

    const output: TestExpectedType[] = convertDateFieldsToIsoString(input)

    expect(output).toStrictEqual([
      {
        id: 1,
        date: date1.toISOString(),
        value: 'test',
        code: 100,
        reason: 'reason',
      },
      {
        id: 2,
        date: date2.toISOString(),
        value: 'test 2',
        code: 200,
        reason: 'reason 2',
      },
    ])
  })

  it('handles undefined and null', () => {
    const date = new Date()
    const input: TestInputType = {
      id: 1,
      date,
      value: 'test',
      code: 100,
      reason: null,
      other: undefined,
    }

    const output: TestExpectedType = convertDateFieldsToIsoString(input)

    expect(output).toStrictEqual({
      id: 1,
      date: date.toISOString(),
      value: 'test',
      code: 100,
      reason: null,
      other: undefined,
    })
  })

  it('properly handles all types of arrays', () => {
    const date = new Date()
    const input = {
      array1: [date, date],
      array2: [1, 2],
      array3: ['a', 'b'],
      array4: [
        { id: 1, value: 'value', date, code: 100 } satisfies TestInputType,
        { id: 2, value: 'value2', date, code: 200 } satisfies TestInputType,
      ],
      array5: [1, date, 'a', { id: 1, value: 'value', date, code: 100 } satisfies TestInputType],
    }

    type Expected = {
      array1: string[]
      array2: number[]
      array3: string[]
      array4: TestExpectedType[]
      array5: (number | string | TestExpectedType)[]
    }
    const output: Expected = convertDateFieldsToIsoString(input)

    expect(output).toStrictEqual({
      array1: [date.toISOString(), date.toISOString()],
      array2: [1, 2],
      array3: ['a', 'b'],
      array4: [
        { id: 1, value: 'value', date: date.toISOString(), code: 100 },
        { id: 2, value: 'value2', date: date.toISOString(), code: 200 },
      ],
      array5: [
        1,
        date.toISOString(),
        'a',
        { id: 1, value: 'value', date: date.toISOString(), code: 100 },
      ],
    })
  })

  it('nested objects and array', () => {
    const date1 = new Date()
    const date2 = new Date()
    date2.setFullYear(1990)
    const input: TestInputType = {
      id: 1,
      date: date1,
      value: 'test',
      code: 100,
      reason: 'reason',
      other: {
        id: 2,
        value: 'test 2',
        date: date2,
        code: 200,
        reason: null,
        other: undefined,
      },
      array: [
        {
          id: 1,
          createdAt: date1,
        },
        {
          id: 2,
          createdAt: date2,
        },
      ],
    }

    const output: TestExpectedType = convertDateFieldsToIsoString(input)

    expect(output).toMatchObject({
      id: 1,
      date: date1.toISOString(),
      value: 'test',
      code: 100,
      reason: 'reason',
      other: {
        id: 2,
        value: 'test 2',
        date: date2.toISOString(),
        code: 200,
        reason: null,
        other: undefined,
      },
      array: [
        {
          id: 1,
          createdAt: date1.toISOString(),
        },
        {
          id: 2,
          createdAt: date2.toISOString(),
        },
      ],
    })
  })
})
