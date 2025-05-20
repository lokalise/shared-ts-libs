import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import stringSplitFactory from './stringSplitFactory'

describe('stringSplitFactory', () => {
  it('splits data into substrings', () => {
    const splitter = stringSplitFactory()
    const schema = z.preprocess(splitter, z.array(z.string()))
    const result = schema.parse('1,2,3')

    expect(result).toEqual(['1', '2', '3'])
  })

  it('can use custom delimiter', () => {
    const splitter = stringSplitFactory({ delimiter: '|' })
    const schema = z.preprocess(splitter, z.array(z.string()))
    const result = schema.parse('1|2|3')

    expect(result).toEqual(['1', '2', '3'])
  })

  it('can use regex delimiter', () => {
    const splitter = stringSplitFactory({ delimiter: /\D/ })
    const schema = z.preprocess(splitter, z.array(z.string()))
    const result = schema.parse('12a34_56')

    expect(result).toEqual(['12', '34', '56'])
  })

  it('does not trim values by default', () => {
    const splitter = stringSplitFactory()
    const schema = z.preprocess(splitter, z.array(z.string()))
    const result = schema.parse('1, 2 ,3 ')

    expect(result).toEqual(['1', ' 2 ', '3 '])
  })

  it('can trim values after trimming', () => {
    const splitter = stringSplitFactory({ trim: true })
    const schema = z.preprocess(splitter, z.array(z.string()))
    const result = schema.parse('1, 2 ,3 ')

    expect(result).toEqual(['1', '2', '3'])
  })

  it('leaves non-strings untouched', () => {
    const splitter = stringSplitFactory()
    const schema = z.preprocess(splitter, z.array(z.number()))

    expect(() => schema.parse(123)).toThrow(/Expected array, received number/)
  })
})
