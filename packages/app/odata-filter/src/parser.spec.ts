import { describe, expect, it } from 'vitest'
import { ODataParseError } from './errors.ts'
import { parseFilterQuery } from './parser.ts'

describe('parseFilterQuery', () => {
  it('parses valid filters', () => {
    const result = parseFilterQuery("status eq 'active'")
    expect(result.tree).toBeDefined()
    expect(result.binds).toHaveLength(1)
  })

  it('throws on empty input', () => {
    expect(() => parseFilterQuery('')).toThrow(ODataParseError)
    expect(() => parseFilterQuery('   ')).toThrow(ODataParseError)
  })

  it('throws on invalid syntax', () => {
    expect(() => parseFilterQuery('!!!')).toThrow(ODataParseError)
  })

  it('re-throws ODataParseError', () => {
    try {
      parseFilterQuery('')
    } catch (error) {
      expect(error).toBeInstanceOf(ODataParseError)
      expect(() => parseFilterQuery('')).toThrow(ODataParseError)
    }
  })
})
