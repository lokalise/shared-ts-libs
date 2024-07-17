import { describe, expect, it } from 'vitest'
import { uniq } from './uniq'

describe('uniq', () => {
  it('returns a new array of mixed primitive value without duplicates', () => {
    const objectA = {}
    const objectB = {}
    const duplicateValues = [
      1,
      1,
      'a',
      'a',
      Number.NaN,
      Number.NaN,
      true,
      true,
      false,
      false,
      null,
      null,
      undefined,
      undefined,
      objectA,
      objectA,
      objectB,
      objectB,
    ]

    expect(uniq(duplicateValues)).toEqual([
      1,
      'a',
      Number.NaN,
      true,
      false,
      null,
      undefined,
      objectA,
      objectB,
    ])
  })
})
