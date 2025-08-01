import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { numberSplitFactory } from './numberSplitFactory.ts'

describe('numberSplitFactory', () => {
  it('splits data into substrings', () => {
    const splitter = numberSplitFactory()
    const schema = z.preprocess(splitter, z.array(z.number()))
    const result = schema.parse('1,2,3')

    expect(result).toEqual([1, 2, 3])
  })

  it('can use custom delimiter', () => {
    const splitter = numberSplitFactory({ delimiter: '|' })
    const schema = z.preprocess(splitter, z.array(z.number()))
    const result = schema.parse('1|2|3')

    expect(result).toEqual([1, 2, 3])
  })

  it('can use regex delimiter', () => {
    const splitter = numberSplitFactory({ delimiter: /\D/ })
    const schema = z.preprocess(splitter, z.array(z.number()))
    const result = schema.parse('12a34_56')

    expect(result).toEqual([12, 34, 56])
  })

  it('leaves non-strings untouched', () => {
    const splitter = numberSplitFactory()
    const schema = z.preprocess(splitter, z.array(z.number()))

    expect(() => schema.parse(123)).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "array",
          "code": "invalid_type",
          "path": [],
          "message": "Invalid input: expected array, received number"
        }
      ]]
    `)
  })
})
