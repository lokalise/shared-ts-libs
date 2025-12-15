import { parse } from '@balena/odata-parser'
import { describe, expect, it } from 'vitest'
import {
  collectAndFilters,
  collectOrFilters,
  extractComparison,
  extractEqualityValue,
  extractInValues,
  flattenFilters,
  hasFieldFilter,
  transformFilter,
} from './index.ts'

describe('e2e: logical operators', () => {
  describe('AND operator', () => {
    it('parses and transforms AND filter', () => {
      const result = parse("$filter=status eq 'active' and price gt 100", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<string>(transformed, 'status')).toBe('active')
      expect(extractComparison(transformed, 'price', 'gt')?.value).toBe(100)
    })

    it('collectAndFilters collects filters from AND', () => {
      const result = parse("$filter=status eq 'active' and price gt 100", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const andFilters = collectAndFilters(transformed)

      expect(andFilters).toHaveLength(2)
    })

    it('collectAndFilters returns single filter for non-AND', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const andFilters = collectAndFilters(transformed)

      expect(andFilters).toHaveLength(1)
    })
  })

  describe('OR operator', () => {
    it('parses and transforms OR filter', () => {
      const result = parse("$filter=type eq 'A' or type eq 'B'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed.type).toBe('logical')
      expect(hasFieldFilter(transformed, 'type')).toBe(true)
    })

    it('collectOrFilters collects filters from OR', () => {
      const result = parse("$filter=type eq 'A' or type eq 'B'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const orFilters = collectOrFilters(transformed)

      expect(orFilters).toHaveLength(2)
    })

    it('collectOrFilters returns single filter for non-OR', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const orFilters = collectOrFilters(transformed)

      expect(orFilters).toHaveLength(1)
    })
  })

  describe('NOT operator', () => {
    it('parses and transforms not filter', () => {
      const result = parse('$filter=not (isDeleted eq true)', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed.type).toBe('not')
      expect(hasFieldFilter(transformed, 'isDeleted')).toBe(true)
    })

    it('handles not with in filter', () => {
      const result = parse("$filter=not (status in ('deleted', 'archived'))", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed.type).toBe('not')
      if (transformed.type === 'not') {
        expect(transformed.filter.type).toBe('in')
      }
    })

    it('handles not with string function', () => {
      const result = parse("$filter=not contains(name, 'test')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed.type).toBe('not')
      if (transformed.type === 'not') {
        expect(transformed.filter.type).toBe('string-function')
      }
    })

    it('flattenFilters handles nested not filter', () => {
      const result = parse('$filter=not (isDeleted eq true)', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const flattened = flattenFilters(transformed)

      expect(flattened).toHaveLength(1)
    })
  })

  describe('nested logical expressions', () => {
    it('parses complex nested logical filter', () => {
      const result = parse(
        "$filter=isActive eq true and (category eq 'electronics' or category eq 'books')",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<boolean>(transformed, 'isActive')).toBe(true)
      expect(hasFieldFilter(transformed, 'category')).toBe(true)
    })

    it('handles deeply nested AND/OR', () => {
      const result = parse("$filter=(a eq 1 and b eq 2) or (c eq 3 and d eq 4)", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed.type).toBe('logical')
      expect(hasFieldFilter(transformed, 'a')).toBe(true)
      expect(hasFieldFilter(transformed, 'b')).toBe(true)
      expect(hasFieldFilter(transformed, 'c')).toBe(true)
      expect(hasFieldFilter(transformed, 'd')).toBe(true)
    })
  })

  describe('n-ary logical operators', () => {
    it('handles AND with more than 2 operands', () => {
      const result = parse('$filter=a eq 1 and b eq 2 and c eq 3 and d eq 4', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const flattened = flattenFilters(transformed)

      expect(flattened.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('flattenFilters', () => {
    it('returns single filter as array', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(flattenFilters(transformed)).toEqual([transformed])
    })

    it('flattens logical filters', () => {
      const result = parse("$filter=status eq 'active' and price gt 100", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const flattened = flattenFilters(transformed)

      expect(flattened).toHaveLength(2)
      expect(flattened[0]?.type).toBe('comparison')
      expect(flattened[1]?.type).toBe('comparison')
    })
  })
})
