import { describe, expect, it } from 'vitest'
import { copyWithoutNullish } from './copyWithoutNullish.js'

describe('copyWithoutNullish', () => {
  it('Does nothing when there are no undefined fields', () => {
    const result = copyWithoutNullish({
      a: 'a',
      b: '',
      c: ' ',
      d: null,
      e: {},
    })

    expect(result).toMatchInlineSnapshot(`
      {
        "a": "a",
        "b": "",
        "c": " ",
        "e": {},
      }
    `)
  })

  it('Removes undefined fields', () => {
    const result = copyWithoutNullish({
      a: undefined,
      b: 'a',
      c: '',
      d: undefined,
      e: ' ',
      f: null,
      g: {
        someParam: 12,
      },
      h: undefined,
    })

    const varWithNarrowedType = result satisfies Record<
      string,
      string | Record<string, unknown> | null
    >
    const bValue: string = varWithNarrowedType.b
    const gValue: {
      someParam: number
    } = varWithNarrowedType.g

    expect(bValue).toBe('a')
    expect(gValue).toEqual({
      someParam: 12,
    })

    expect(result).toMatchInlineSnapshot(`
      {
        "b": "a",
        "c": "",
        "e": " ",
        "g": {
          "someParam": 12,
        },
      }
    `)
  })
})
