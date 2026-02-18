import odataParser from '@balena/odata-parser'

const { parse } = odataParser

import { describe, expect, it } from 'vitest'
import {
  createFilterMap,
  extractAllFieldValues,
  extractComparison,
  extractEqualityValue,
  extractInclusiveRange,
  extractRange,
  findUnsupportedField,
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

  describe('findUnsupportedField', () => {
    it('returns undefined when all fields are supported (Set)', () => {
      const result = parse(
        "$filter=status eq 'active' and price gt 100 and contains(name, 'test')",
        { startRule: 'ProcessRule', rule: 'QueryOptions' },
      )
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(
        findUnsupportedField(transformed, new Set(['status', 'price', 'name'])),
      ).toBeUndefined()
    })

    it('returns undefined when all fields are supported (array)', () => {
      const result = parse("$filter=status eq 'active' and price gt 100", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(findUnsupportedField(transformed, ['status', 'price'])).toBeUndefined()
    })

    it('returns first unsupported field name', () => {
      const result = parse("$filter=status eq 'active' and priority gt 5", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(findUnsupportedField(transformed, new Set(['status']))).toBe('priority')
    })

    it('returns unsupported field from string function', () => {
      const result = parse("$filter=contains(description, 'test')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(findUnsupportedField(transformed, new Set(['name']))).toBe('description')
    })

    it('detects unsupported field in "in" operator', () => {
      const result = parse("$filter=category in ('a', 'b')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(findUnsupportedField(transformed, new Set(['status']))).toBe('category')
    })

    it('returns undefined for single supported field', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(findUnsupportedField(transformed, new Set(['status']))).toBeUndefined()
    })

    it('detects unsupported field in nested logical filter', () => {
      const result = parse(
        "$filter=(status eq 'active' or priority gt 5) and category eq 'books'",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(findUnsupportedField(transformed, new Set(['status', 'category']))).toBe('priority')
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

  describe('extractInclusiveRange', () => {
    it('returns undefined when no range operators found', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractInclusiveRange(transformed, 'status')).toBeUndefined()
    })

    it('extracts inclusive range with ge and le', () => {
      const result = parse('$filter=price ge 100 and price le 500', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractInclusiveRange(transformed, 'price')

      expect(range).toEqual({ min: 100, max: 500 })
    })

    it('extracts partial inclusive range (only min)', () => {
      const result = parse('$filter=price ge 100', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractInclusiveRange(transformed, 'price')

      expect(range).toEqual({ min: 100 })
    })

    it('extracts partial inclusive range (only max)', () => {
      const result = parse('$filter=price le 500', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractInclusiveRange(transformed, 'price')

      expect(range).toEqual({ max: 500 })
    })

    it('throws for gt operator', () => {
      const result = parse('$filter=price gt 100', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(() => extractInclusiveRange(transformed, 'price')).toThrow(
        "Field 'price' uses 'gt' operator, but only 'ge' (inclusive) is supported",
      )
    })

    it('throws for lt operator', () => {
      const result = parse('$filter=price lt 500', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(() => extractInclusiveRange(transformed, 'price')).toThrow(
        "Field 'price' uses 'lt' operator, but only 'le' (inclusive) is supported",
      )
    })

    it('throws for mixed inclusive/exclusive operators', () => {
      const result = parse('$filter=price ge 100 and price lt 500', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(() => extractInclusiveRange(transformed, 'price')).toThrow(
        "Field 'price' uses 'lt' operator, but only 'le' (inclusive) is supported",
      )
    })

    it('works with string date values', () => {
      const result = parse(
        "$filter=lastModifiedAt ge '2024-01-01' and lastModifiedAt le '2024-12-31'",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )
      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractInclusiveRange(transformed, 'lastModifiedAt')

      expect(range).toEqual({ min: '2024-01-01', max: '2024-12-31' })
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
