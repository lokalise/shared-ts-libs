import { describe, expect, it } from 'vitest'
import {
  collectAndFilters,
  collectOrFilters,
  createFilterMap,
  extractAllFieldValues,
  extractComparison,
  extractEqualityValue,
  extractFieldValues,
  extractInValues,
  extractRange,
  extractStringFunction,
  flattenFilters,
  getFilteredFieldNames,
  getFiltersForField,
  hasFieldFilter,
} from '../filterExtractor.ts'
import { transformFilter } from '../filterTransformer.ts'
import type {
  ComparisonFilter,
  FilterTreeNode,
  InFilter,
  LogicalFilter,
  StringFunctionFilter,
  TransformedFilter,
} from '../types.ts'
import { createBinds } from './testHelpers.ts'

describe('filterExtractor', () => {
  describe('flattenFilters', () => {
    it('returns single filter as array', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      const result = flattenFilters(filter)

      expect(result).toEqual([filter])
    })

    it('flattens AND logical filter', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'a', operator: 'eq', value: 1 },
          { type: 'comparison', field: 'b', operator: 'eq', value: 2 },
        ],
      }

      const result = flattenFilters(filter)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ type: 'comparison', field: 'a', operator: 'eq', value: 1 })
      expect(result[1]).toEqual({ type: 'comparison', field: 'b', operator: 'eq', value: 2 })
    })

    it('flattens nested logical filters', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'a', operator: 'eq', value: 1 },
          {
            type: 'logical',
            operator: 'or',
            filters: [
              { type: 'comparison', field: 'b', operator: 'eq', value: 2 },
              { type: 'comparison', field: 'c', operator: 'eq', value: 3 },
            ],
          },
        ],
      }

      const result = flattenFilters(filter)

      expect(result).toHaveLength(3)
    })

    it('flattens not filter', () => {
      const filter: TransformedFilter = {
        type: 'not',
        filter: { type: 'comparison', field: 'deleted', operator: 'eq', value: true },
      }

      const result = flattenFilters(filter)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'comparison',
        field: 'deleted',
        operator: 'eq',
        value: true,
      })
    })
  })

  describe('getFiltersForField', () => {
    it('returns filters for specific field', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'status', operator: 'eq', value: 'active' },
          { type: 'comparison', field: 'price', operator: 'gt', value: 100 },
        ],
      }

      const result = getFiltersForField(filter, 'status')

      expect(result).toHaveLength(1)
      expect((result[0] as ComparisonFilter).field).toBe('status')
    })

    it('returns empty array for non-existent field', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      const result = getFiltersForField(filter, 'nonExistent')

      expect(result).toEqual([])
    })

    it('returns in filter for field', () => {
      const filter: InFilter = {
        type: 'in',
        field: 'categoryId',
        values: [1, 2, 3],
      }

      const result = getFiltersForField(filter, 'categoryId')

      expect(result).toHaveLength(1)
    })

    it('returns string function filter for field', () => {
      const filter: StringFunctionFilter = {
        type: 'string-function',
        function: 'contains',
        field: 'title',
        value: 'search',
      }

      const result = getFiltersForField(filter, 'title')

      expect(result).toHaveLength(1)
    })
  })

  describe('extractEqualityValue', () => {
    it('extracts equality value', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      const result = extractEqualityValue<string>(filter, 'status')

      expect(result).toBe('active')
    })

    it('returns undefined for non-equality operator', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'price',
        operator: 'gt',
        value: 100,
      }

      const result = extractEqualityValue(filter, 'price')

      expect(result).toBeUndefined()
    })

    it('returns undefined for non-existent field', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      const result = extractEqualityValue(filter, 'other')

      expect(result).toBeUndefined()
    })
  })

  describe('extractInValues', () => {
    it('extracts in values', () => {
      const filter: InFilter = {
        type: 'in',
        field: 'parentId',
        values: ['root', 'parent-123', 'parent-456'],
      }

      const result = extractInValues<string>(filter, 'parentId')

      expect(result).toEqual(['root', 'parent-123', 'parent-456'])
    })

    it('returns undefined for non-in filter', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      const result = extractInValues(filter, 'status')

      expect(result).toBeUndefined()
    })
  })

  describe('extractFieldValues', () => {
    it('extracts in values as array', () => {
      const filter: InFilter = {
        type: 'in',
        field: 'parentId',
        values: ['root', 'parent-123'],
      }

      const result = extractFieldValues<string>(filter, 'parentId')

      expect(result).toEqual(['root', 'parent-123'])
    })

    it('extracts equality value as array', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      const result = extractFieldValues<string>(filter, 'status')

      expect(result).toEqual(['active'])
    })

    it('returns undefined for non-matching field', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      const result = extractFieldValues(filter, 'other')

      expect(result).toBeUndefined()
    })

    it('prefers in values over equality', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'in', field: 'status', values: ['a', 'b'] },
          { type: 'comparison', field: 'status', operator: 'eq', value: 'c' },
        ],
      }

      const result = extractFieldValues<string>(filter, 'status')

      expect(result).toEqual(['a', 'b'])
    })
  })

  describe('extractComparison', () => {
    it('extracts comparison with specific operator', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'price', operator: 'gt', value: 100 },
          { type: 'comparison', field: 'price', operator: 'lt', value: 500 },
        ],
      }

      const gtResult = extractComparison(filter, 'price', 'gt')
      const ltResult = extractComparison(filter, 'price', 'lt')

      expect(gtResult?.value).toBe(100)
      expect(ltResult?.value).toBe(500)
    })

    it('returns undefined if operator not found', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'price',
        operator: 'gt',
        value: 100,
      }

      const result = extractComparison(filter, 'price', 'lt')

      expect(result).toBeUndefined()
    })
  })

  describe('extractRange', () => {
    it('extracts range with min and max', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'price', operator: 'ge', value: 100 },
          { type: 'comparison', field: 'price', operator: 'le', value: 500 },
        ],
      }

      const result = extractRange(filter, 'price')

      expect(result).toEqual({
        min: 100,
        minInclusive: true,
        max: 500,
        maxInclusive: true,
      })
    })

    it('extracts exclusive range bounds', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'price', operator: 'gt', value: 100 },
          { type: 'comparison', field: 'price', operator: 'lt', value: 500 },
        ],
      }

      const result = extractRange(filter, 'price')

      expect(result).toEqual({
        min: 100,
        minInclusive: false,
        max: 500,
        maxInclusive: false,
      })
    })

    it('extracts only min bound', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'price',
        operator: 'gt',
        value: 100,
      }

      const result = extractRange(filter, 'price')

      expect(result).toEqual({
        min: 100,
        minInclusive: false,
      })
    })

    it('returns undefined for non-range filter', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      const result = extractRange(filter, 'status')

      expect(result).toBeUndefined()
    })
  })

  describe('extractStringFunction', () => {
    it('extracts string function filter', () => {
      const filter: StringFunctionFilter = {
        type: 'string-function',
        function: 'contains',
        field: 'title',
        value: 'search',
      }

      const result = extractStringFunction(filter, 'title')

      expect(result).toEqual(filter)
    })

    it('extracts specific string function', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'string-function', function: 'startswith', field: 'name', value: 'John' },
          { type: 'string-function', function: 'contains', field: 'name', value: 'ohn' },
        ],
      }

      const result = extractStringFunction(filter, 'name', 'startswith')

      expect(result?.function).toBe('startswith')
    })

    it('returns undefined for non-matching function', () => {
      const filter: StringFunctionFilter = {
        type: 'string-function',
        function: 'contains',
        field: 'title',
        value: 'search',
      }

      const result = extractStringFunction(filter, 'title', 'startswith')

      expect(result).toBeUndefined()
    })
  })

  describe('hasFieldFilter', () => {
    it('returns true for filtered field', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      expect(hasFieldFilter(filter, 'status')).toBe(true)
    })

    it('returns false for non-filtered field', () => {
      const filter: ComparisonFilter = {
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      }

      expect(hasFieldFilter(filter, 'other')).toBe(false)
    })
  })

  describe('getFilteredFieldNames', () => {
    it('returns all filtered field names', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'status', operator: 'eq', value: 'active' },
          { type: 'comparison', field: 'price', operator: 'gt', value: 100 },
          { type: 'in', field: 'categoryId', values: [1, 2] },
        ],
      }

      const result = getFilteredFieldNames(filter)

      expect(result).toContain('status')
      expect(result).toContain('price')
      expect(result).toContain('categoryId')
      expect(result).toHaveLength(3)
    })

    it('deduplicates field names', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'price', operator: 'gt', value: 100 },
          { type: 'comparison', field: 'price', operator: 'lt', value: 500 },
        ],
      }

      const result = getFilteredFieldNames(filter)

      expect(result).toEqual(['price'])
    })
  })

  describe('collectAndFilters', () => {
    it('collects filters from AND chain', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'a', operator: 'eq', value: 1 },
          {
            type: 'logical',
            operator: 'and',
            filters: [
              { type: 'comparison', field: 'b', operator: 'eq', value: 2 },
              { type: 'comparison', field: 'c', operator: 'eq', value: 3 },
            ],
          },
        ],
      }

      const result = collectAndFilters(filter)

      expect(result).toHaveLength(3)
    })

    it('stops at OR nodes', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'a', operator: 'eq', value: 1 },
          {
            type: 'logical',
            operator: 'or',
            filters: [
              { type: 'comparison', field: 'b', operator: 'eq', value: 2 },
              { type: 'comparison', field: 'c', operator: 'eq', value: 3 },
            ],
          },
        ],
      }

      const result = collectAndFilters(filter)

      expect(result).toHaveLength(2) // a and the whole OR block
    })
  })

  describe('collectOrFilters', () => {
    it('collects filters from OR chain', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'or',
        filters: [
          { type: 'comparison', field: 'a', operator: 'eq', value: 1 },
          {
            type: 'logical',
            operator: 'or',
            filters: [
              { type: 'comparison', field: 'b', operator: 'eq', value: 2 },
              { type: 'comparison', field: 'c', operator: 'eq', value: 3 },
            ],
          },
        ],
      }

      const result = collectOrFilters(filter)

      expect(result).toHaveLength(3)
    })
  })

  describe('createFilterMap', () => {
    it('creates map of field to filters', () => {
      const filter: LogicalFilter = {
        type: 'logical',
        operator: 'and',
        filters: [
          { type: 'comparison', field: 'status', operator: 'eq', value: 'active' },
          { type: 'comparison', field: 'price', operator: 'gt', value: 100 },
          { type: 'comparison', field: 'price', operator: 'lt', value: 500 },
        ],
      }

      const result = createFilterMap(filter)

      expect(result.get('status')).toHaveLength(1)
      expect(result.get('price')).toHaveLength(2)
    })
  })

  describe('extractAllFieldValues', () => {
    it('extracts all field values from raw parser output', () => {
      const tree: FilterTreeNode = [
        'and',
        ['eq', { name: 'status' }, { bind: 0 }],
        ['in', { name: 'parentId' }, [{ bind: 1 }, { bind: 2 }]],
      ]
      const binds = createBinds([
        ['Text', 'active'],
        ['Text', 'root'],
        ['Text', 'parent-123'],
      ])

      const result = extractAllFieldValues(tree, binds)

      expect(result.get('status')).toEqual(['active'])
      expect(result.get('parentId')).toEqual(['root', 'parent-123'])
    })
  })

  describe('integration with transformFilter', () => {
    it('transforms and extracts parentId in filter (user example)', () => {
      // This matches the user's example from their question
      const tree: FilterTreeNode = [
        'in',
        { name: 'parentId' },
        [{ bind: 0 }, { bind: 1 }, { bind: 2 }],
      ]
      const binds = createBinds([
        ['Text', 'root'],
        ['Text', 'parent-123'],
        ['Text', 'parent-456'],
      ])

      const transformed = transformFilter(tree, binds)
      const parentIds = extractInValues<string>(transformed, 'parentId')

      expect(parentIds).toEqual(['root', 'parent-123', 'parent-456'])

      // Can also get the same result using extractFieldValues
      const fieldValues = extractFieldValues<string>(transformed, 'parentId')
      expect(fieldValues).toEqual(['root', 'parent-123', 'parent-456'])
    })

    it('handles complex filter with multiple conditions', () => {
      const tree: FilterTreeNode = [
        'and',
        ['eq', { name: 'status' }, { bind: 0 }],
        [
          'and',
          ['in', { name: 'parentId' }, [{ bind: 1 }, { bind: 2 }]],
          ['contains', { name: 'name' }, { bind: 3 }],
        ],
      ]
      const binds = createBinds([
        ['Text', 'active'],
        ['Text', 'root'],
        ['Text', 'parent-123'],
        ['Text', 'search'],
      ])

      const transformed = transformFilter(tree, binds)

      expect(extractEqualityValue<string>(transformed, 'status')).toBe('active')
      expect(extractInValues<string>(transformed, 'parentId')).toEqual(['root', 'parent-123'])

      const searchFilter = extractStringFunction(transformed, 'name', 'contains')
      expect(searchFilter?.value).toBe('search')
    })
  })
})
