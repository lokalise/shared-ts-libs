import { describe, expect, it } from 'vitest'
import { pick } from './pick.js'

describe('pick', () => {
  it('Picks specified fields', () => {
    const result = pick(
      {
        a: 'a',
        b: '',
        c: ' ',
        d: null,
        e: {},
      },
      ['a', 'c', 'e'],
    )
    expect(result).toStrictEqual({ a: 'a', c: ' ', e: {} })
  })

  it('Ignores missing fields', () => {
    const result = pick(
      {
        a: 'a',
        b: '',
        c: ' ',
        d: null,
        e: {},
      },
      ['a', 'f', 'g'],
    )

    expect(result).toStrictEqual({ a: 'a' })
  })

  it('Includes undefined and null fields by default', () => {
    const result = pick(
      {
        a: 'a',
        b: undefined,
        c: {},
        d: null,
      },
      ['a', 'b', 'd'],
    )

    expect(result).toStrictEqual({ a: 'a', b: undefined, d: null })
  })

  it('Skips undefined and null fields if it is specified ', () => {
    const obj = {
      a: 'a',
      b: undefined,
      c: {},
      d: null,
    }

    expect(pick(obj, ['a', 'b', 'd'], { keepUndefined: false, keepNull: false })).toStrictEqual({
      a: 'a',
    })
    expect(pick(obj, ['a', 'b', 'd'], { keepNull: false })).toStrictEqual({
      a: 'a',
      b: undefined,
    })
    expect(pick(obj, ['a', 'b', 'd'], { keepUndefined: false })).toStrictEqual({
      a: 'a',
      d: null,
    })
  })
})
