import { describe, expect, it } from 'vitest'
import {
  extractEqualityValue,
  extractInValues,
  extractRange,
  ODataParseError,
  parseAndTransformFilter,
  parseODataFilter,
  transformFilter,
} from './index.ts'

describe('parseODataFilter', () => {
  describe('successful parsing', () => {
    it('parses simple equality filter', () => {
      const result = parseODataFilter("status eq 'active'")

      expect(result.tree).not.toBeNull()
      expect(result.binds).toHaveLength(1)
      expect(result.originalFilter).toBe("status eq 'active'")
    })

    it('parses numeric equality filter', () => {
      const result = parseODataFilter('count eq 42')

      expect(result.tree).not.toBeNull()
      expect(result.binds).toHaveLength(1)
      expect(result.originalFilter).toBe('count eq 42')
    })

    it('parses boolean equality filter', () => {
      const result = parseODataFilter('isActive eq true')

      expect(result.tree).not.toBeNull()
      expect(result.binds).toHaveLength(1)
    })

    it('parses complex filter with and', () => {
      const result = parseODataFilter("status eq 'active' and priority gt 5")

      expect(result.tree).not.toBeNull()
      expect(result.binds).toHaveLength(2)
    })

    it('parses in operator filter', () => {
      const result = parseODataFilter("status in ('active', 'pending')")

      expect(result.tree).not.toBeNull()
      expect(result.originalFilter).toBe("status in ('active', 'pending')")
    })

    it('parses contains function', () => {
      const result = parseODataFilter("contains(name, 'test')")

      expect(result.tree).not.toBeNull()
      expect(result.binds).toHaveLength(1)
    })

    it('parses nested property filter', () => {
      const result = parseODataFilter("address/city eq 'NYC'")

      expect(result.tree).not.toBeNull()
      expect(result.binds).toHaveLength(1)
    })
  })

  describe('null/empty handling', () => {
    it('returns null tree for undefined filter', () => {
      const result = parseODataFilter(undefined)

      expect(result.tree).toBeNull()
      expect(result.binds).toEqual([])
      expect(result.originalFilter).toBeUndefined()
    })

    it('returns null tree for empty string', () => {
      const result = parseODataFilter('')

      expect(result.tree).toBeNull()
      expect(result.binds).toEqual([])
      expect(result.originalFilter).toBe('')
    })

    it('returns null tree for whitespace-only string', () => {
      const result = parseODataFilter('   ')

      expect(result.tree).toBeNull()
      expect(result.binds).toEqual([])
      expect(result.originalFilter).toBe('   ')
    })
  })

  describe('error handling', () => {
    it('throws ODataParseError for invalid filter', () => {
      expect(() => parseODataFilter('invalid filter syntax !@#$')).toThrow(ODataParseError)
    })

    it('includes filter string in error', () => {
      try {
        parseODataFilter('invalid !@#')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ODataParseError)
        expect((error as ODataParseError).filter).toBe('invalid !@#')
      }
    })

    it('includes cause in error', () => {
      try {
        parseODataFilter('!@#$%^&*()')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ODataParseError)
        expect((error as ODataParseError).cause).toBeDefined()
      }
    })

    it('has correct error name', () => {
      try {
        parseODataFilter('bad syntax')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ODataParseError)
        expect((error as ODataParseError).name).toBe('ODataParseError')
      }
    })
  })

  describe('integration with transformFilter', () => {
    it('works with transformFilter for equality', () => {
      const parsed = parseODataFilter("status eq 'active'")

      expect(parsed.tree).not.toBeNull()
      const filter = transformFilter(parsed.tree!, parsed.binds)
      const status = extractEqualityValue<string>(filter, 'status')

      expect(status).toBe('active')
    })

    it('works with transformFilter for in operator', () => {
      const parsed = parseODataFilter("parentId in ('root', 'parent-123')")

      expect(parsed.tree).not.toBeNull()
      const filter = transformFilter(parsed.tree!, parsed.binds)
      const parentIds = extractInValues<string>(filter, 'parentId')

      expect(parentIds).toEqual(['root', 'parent-123'])
    })

    it('works with transformFilter for complex filter', () => {
      const parsed = parseODataFilter("status eq 'active' and priority gt 5")

      expect(parsed.tree).not.toBeNull()
      const filter = transformFilter(parsed.tree!, parsed.binds)

      expect(filter.type).toBe('logical')
      const status = extractEqualityValue<string>(filter, 'status')
      expect(status).toBe('active')
    })
  })
})

describe('parseAndTransformFilter', () => {
  describe('successful transformation', () => {
    it('parses and transforms a simple equality filter', () => {
      const filter = parseAndTransformFilter("status eq 'active'")

      expect(filter.type).toBe('comparison')
      const status = extractEqualityValue<string>(filter, 'status')
      expect(status).toBe('active')
    })

    it('parses and transforms a complex AND filter', () => {
      const filter = parseAndTransformFilter("status eq 'active' and price ge 100")

      expect(filter.type).toBe('logical')
      const status = extractEqualityValue<string>(filter, 'status')
      expect(status).toBe('active')
      const range = extractRange(filter, 'price')
      expect(range).toEqual({ min: 100, minInclusive: true })
    })

    it('parses and transforms an in operator filter', () => {
      const filter = parseAndTransformFilter("parentId in ('root', 'parent-123')")

      expect(filter.type).toBe('in')
      const parentIds = extractInValues<string>(filter, 'parentId')
      expect(parentIds).toEqual(['root', 'parent-123'])
    })

    it('parses and transforms a string function filter', () => {
      const filter = parseAndTransformFilter("contains(name, 'test')")

      expect(filter.type).toBe('string-function')
    })

    it('parses and transforms a boolean filter', () => {
      const filter = parseAndTransformFilter('isActive eq true')

      expect(filter.type).toBe('comparison')
      const isActive = extractEqualityValue<boolean>(filter, 'isActive')
      expect(isActive).toBe(true)
    })

    it('parses and transforms a numeric comparison filter', () => {
      const filter = parseAndTransformFilter('count gt 42')

      expect(filter.type).toBe('comparison')
    })

    it('parses and transforms a nested property filter', () => {
      const filter = parseAndTransformFilter("address/city eq 'NYC'")

      expect(filter.type).toBe('comparison')
      const city = extractEqualityValue<string>(filter, 'address/city')
      expect(city).toBe('NYC')
    })

    it('parses and transforms a multi-field filter with all extraction types', () => {
      const filter = parseAndTransformFilter(
        "path in ('root', 'drive-1') and owner in ('me') and lastModifiedAt ge '2024-01-01' and lastModifiedAt le '2024-12-31' and contains(fileName, 'report')",
      )

      expect(filter.type).toBe('logical')
      expect(extractInValues<string>(filter, 'path')).toEqual(['root', 'drive-1'])
      expect(extractInValues<string>(filter, 'owner')).toEqual(['me'])
      expect(extractRange(filter, 'lastModifiedAt')).toEqual({
        min: '2024-01-01',
        minInclusive: true,
        max: '2024-12-31',
        maxInclusive: true,
      })
    })
  })

  describe('error handling', () => {
    it('throws ODataParseError for empty string', () => {
      expect(() => parseAndTransformFilter('')).toThrow(ODataParseError)
    })

    it('throws ODataParseError for whitespace-only string', () => {
      expect(() => parseAndTransformFilter('   ')).toThrow(ODataParseError)
    })

    it('throws ODataParseError for invalid syntax', () => {
      expect(() => parseAndTransformFilter('invalid !@#')).toThrow(ODataParseError)
    })

    it('includes filter string in error for empty input', () => {
      try {
        parseAndTransformFilter('')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ODataParseError)
        expect((error as ODataParseError).filter).toBe('')
      }
    })

    it('includes filter string in error for invalid input', () => {
      const badFilter = 'not a valid filter !@#$'
      try {
        parseAndTransformFilter(badFilter)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ODataParseError)
        expect((error as ODataParseError).filter).toBe(badFilter)
      }
    })

    it('error is instanceof Error', () => {
      try {
        parseAndTransformFilter('')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(ODataParseError)
      }
    })
  })
})

describe('ODataParseError', () => {
  it('can be constructed directly', () => {
    const error = new ODataParseError('Test message', 'test filter')

    expect(error.message).toBe('Test message')
    expect(error.filter).toBe('test filter')
    expect(error.name).toBe('ODataParseError')
    expect(error.cause).toBeUndefined()
  })

  it('can include a cause', () => {
    const cause = new Error('Original error')
    const error = new ODataParseError('Wrapper message', 'filter', cause)

    expect(error.cause).toBe(cause)
  })

  it('is instanceof Error', () => {
    const error = new ODataParseError('Test', 'filter')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ODataParseError)
  })
})
