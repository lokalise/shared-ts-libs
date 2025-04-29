import { describe, expect, it } from 'vitest'
import { copyWithoutEmpty } from './copyWithoutEmpty.ts'

describe('copyWithoutEmpty', () => {
  it('Does nothing when there are no empty fields', () => {
    const result = copyWithoutEmpty({
      a: 'a',
      b: ' t ',
      c: ' tt',
      d: 'tt ',
      e: {},
      y: 88,
      z: 0,
    })

    expect(result).toMatchInlineSnapshot(`
        {
          "a": "a",
          "b": " t ",
          "c": " tt",
          "d": "tt ",
          "e": {},
          "y": 88,
          "z": 0,
        }
      `)
  })

  it('Removes empty fields', () => {
    const result = copyWithoutEmpty({
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
      y: 88,
      z: 0,
    })

    const varWithNarrowedType = result satisfies Record<
      string,
      string | Record<string, unknown> | null | number
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
          "g": {
            "someParam": 12,
          },
          "y": 88,
          "z": 0,
        }
      `)
  })
})
