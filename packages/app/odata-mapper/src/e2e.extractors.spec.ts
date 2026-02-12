import { parse } from '@balena/odata-parser'
import { describe, expect, it } from 'vitest'
import {
  createFilterMap,
  extractAllFieldValues,
  extractComparison,
  extractEqualityValue,
  extractRange,
  getFilteredFieldNames,
  getFiltersForField,
  transformFilter,
} from './index.ts'

describe('e2e: filter extractors', () => {
  describe('createFilterMap', () => {
    it('creates map of filters by field', () => {
      const result = parse("$filter=status eq 'active' and price gt 100", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const filterMap = createFilterMap(transformed)

      expect(filterMap.get('status')).toBeDefined()
      expect(filterMap.get('price')).toBeDefined()
    })
  })

  describe('getFiltersForField', () => {
    it('returns filters for specific field', () => {
      const result = parse('$filter=price ge 100 and price le 500', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const priceFilters = getFiltersForField(transformed, 'price')

      expect(priceFilters).toHaveLength(2)
    })

    it('returns empty for non-existent field', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const priceFilters = getFiltersForField(transformed, 'nonexistent')

      expect(priceFilters).toHaveLength(0)
    })

    it('extracts all comparisons for field', () => {
      const result = parse('$filter=price ge 100 and price le 500 and price ne 200', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const priceFilters = getFiltersForField(transformed, 'price')

      expect(priceFilters).toHaveLength(3)
    })
  })

  describe('getFilteredFieldNames', () => {
    it('gets all filtered field names', () => {
      const result = parse(
        "$filter=status eq 'active' and price gt 100 and contains(name, 'test')",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const fieldNames = getFilteredFieldNames(transformed)

      expect(fieldNames.sort()).toEqual(['name', 'price', 'status'])
    })
  })

  describe('extractComparison', () => {
    it('returns undefined for non-matching operator', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractComparison(transformed, 'status', 'gt')).toBeUndefined()
    })

    it('returns undefined for non-existent field', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractComparison(transformed, 'nonexistent', 'eq')).toBeUndefined()
    })
  })

  describe('extractEqualityValue', () => {
    it('returns undefined for non-eq filter', () => {
      const result = parse('$filter=price gt 100', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue(transformed, 'price')).toBeUndefined()
    })
  })

  describe('extractRange', () => {
    it('returns undefined when no range operators found', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractRange(transformed, 'status')).toBeUndefined()
    })

    it('handles partial range (only min)', () => {
      const result = parse('$filter=price ge 100', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractRange(transformed, 'price')

      expect(range?.min).toBe(100)
      expect(range?.max).toBeUndefined()
    })

    it('handles partial range (only max)', () => {
      const result = parse('$filter=price le 500', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractRange(transformed, 'price')

      expect(range?.min).toBeUndefined()
      expect(range?.max).toBe(500)
    })
  })

  describe('extractAllFieldValues', () => {
    it('uses extractAllFieldValues for quick overview', () => {
      const result = parse(
        "$filter=status eq 'published' and categoryId in (1, 2, 3) and authorId eq 42",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )

      const fieldValues = extractAllFieldValues(result.tree.$filter, result.binds)

      expect(fieldValues.get('status')).toEqual(['published'])
      expect(fieldValues.get('categoryId')).toEqual([1, 2, 3])
      expect(fieldValues.get('authorId')).toEqual([42])
    })

    it('handles string functions', () => {
      const result = parse("$filter=contains(name, 'test')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const fieldValues = extractAllFieldValues(result.tree.$filter, result.binds)

      expect(fieldValues.get('name')).toEqual(['test'])
    })

    it('handles nested not filter', () => {
      const result = parse('$filter=not (isDeleted eq true)', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const fieldValues = extractAllFieldValues(result.tree.$filter, result.binds)

      expect(fieldValues.get('isDeleted')).toEqual([true])
    })

    it('handles deeply nested logical filters', () => {
      const result = parse('$filter=(a eq 1 or b eq 2) and c eq 3', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const fieldValues = extractAllFieldValues(result.tree.$filter, result.binds)

      expect(fieldValues.get('a')).toEqual([1])
      expect(fieldValues.get('b')).toEqual([2])
      expect(fieldValues.get('c')).toEqual([3])
    })
  })
})
