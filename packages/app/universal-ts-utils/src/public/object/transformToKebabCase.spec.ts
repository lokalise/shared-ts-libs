import { describe, expect, it } from 'vitest'
import { transformToKebabCase } from './transformToKebabCase.js'

describe('transformToKebabCase', () => {
  it('handle simple null and undefined', () => {
    const result1: null = transformToKebabCase(null)
    expect(result1).toBe(null)

    const result2: undefined = transformToKebabCase(undefined)
    expect(result2).toBe(undefined)
  })

  it('handle null and undefined in object', () => {
    type MyType = {
      my_first_undefined?: number
      mySecondUndefined?: number
      my_first_null: number | null
      mySecondNull: number | null
      nested?: MyType
    }

    type MyExpectedType = {
      'my-first-undefined'?: number
      'my-second-undefined'?: number
      'my-first-null': number | null
      'my-second-null': number | null
      nested?: MyExpectedType
    }

    const input: MyType = {
      my_first_undefined: undefined,
      mySecondUndefined: 1,
      my_first_null: null,
      mySecondNull: 2,
      nested: {
        my_first_undefined: undefined,
        mySecondUndefined: 3,
        my_first_null: null,
        mySecondNull: 4,
      },
    }
    const result: MyExpectedType = transformToKebabCase(input)

    expect(result).toEqual({
      'my-first-undefined': undefined,
      'my-second-undefined': 1,
      'my-first-null': null,
      'my-second-null': 2,
      nested: {
        'my-first-undefined': undefined,
        'my-second-undefined': 3,
        'my-first-null': null,
        'my-second-null': 4,
      },
    } satisfies MyExpectedType)
  })

  it('handle arrays', () => {
    const input = [
      { helloWorld: 'world', my_normal_array: [1, 2] },
      {
        goodBy: 'world',
        my_object_array: [{ myFriend: true }, { myLaptop: false }],
      },
    ]
    const result = transformToKebabCase(input)

    expect(result).toEqual([
      { 'hello-world': 'world', 'my-normal-array': [1, 2] },
      {
        'good-by': 'world',
        'my-object-array': [{ 'my-friend': true }, { 'my-laptop': false }],
      },
    ])
  })

  describe('camelCase', () => {
    it('works with simple objects', () => {
      type MyType = {
        myProp: string
        mySecondProp: number
        extra: string
      }
      type MyExpectedType = {
        'my-prop': string
        'my-second-prop': number
        extra: string
      }

      const input: MyType = {
        myProp: 'example',
        mySecondProp: 1,
        extra: 'extra',
      }
      const result: MyExpectedType = transformToKebabCase(input)

      expect(result).toEqual({
        'my-prop': 'example',
        'my-second-prop': 1,
        extra: 'extra',
      } satisfies MyExpectedType)
    })

    it('works with sub objects', () => {
      type MyType = {
        myProp: string
        mySecondProp: {
          thirdProp: number
          extra: number
        }
      }
      type MyExpectedType = {
        'my-prop': string
        'my-second-prop': {
          'third-prop': number
          extra: number
        }
      }

      const input: MyType = {
        myProp: 'example',
        mySecondProp: { thirdProp: 1, extra: 1 },
      }
      const result: MyExpectedType = transformToKebabCase(input)

      expect(result).toEqual({
        'my-prop': 'example',
        'my-second-prop': { 'third-prop': 1, extra: 1 },
      } satisfies MyExpectedType)
    })

    it('abbreviations', () => {
      type MyType = {
        myHTTPKey: string
      }
      type MyExpectedType = {
        'my-http-key': string
      }

      const input: MyType = { myHTTPKey: 'myValue' }
      const result: MyExpectedType = transformToKebabCase(input)

      expect(result).toEqual({
        'my-http-key': 'myValue',
      } satisfies MyExpectedType)
    })

    it('handling non-alphanumeric symbols', () => {
      type MyType = {
        myProp: string
        'my_second.prop:example': number
      }
      type MyExpectedType = {
        'my-prop': string
        'my-second.prop:example': number
      }

      const input: MyType = { myProp: 'example', 'my_second.prop:example': 1 }
      const result: MyExpectedType = transformToKebabCase(input)

      expect(result).toEqual({
        'my-prop': 'example',
        'my-second.prop:example': 1,
      })
    })
  })

  describe('snake_case', () => {
    it('snake_case works with simple objects', () => {
      type MyType = {
        my_prop: string
        my_second_prop: number
        extra: string
      }
      type MyExpectedType = {
        'my-prop': string
        'my-second-prop': number
        extra: string
      }

      const input: MyType = {
        my_prop: 'example',
        my_second_prop: 1,
        extra: 'extra',
      }
      const result: MyExpectedType = transformToKebabCase(input)

      expect(result).toEqual({
        'my-prop': 'example',
        'my-second-prop': 1,
        extra: 'extra',
      } satisfies MyExpectedType)
    })

    it('works with sub objects', () => {
      type MyType = {
        my_prop: string
        my_second_prop: {
          third_prop: number
          extra: number
        }
      }
      type MyExpectedType = {
        'my-prop': string
        'my-second-prop': {
          'third-prop': number
          extra: number
        }
      }

      const input: MyType = {
        my_prop: 'example',
        my_second_prop: { third_prop: 1, extra: 1 },
      }
      const result: MyExpectedType = transformToKebabCase(input)

      expect(result).toEqual({
        'my-prop': 'example',
        'my-second-prop': { 'third-prop': 1, extra: 1 },
      } satisfies MyExpectedType)
    })
  })
})
