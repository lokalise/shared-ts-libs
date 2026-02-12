import odataParser from '@balena/odata-parser'

const { parse } = odataParser

import { describe, expect, it } from 'vitest'
import { extractFieldValues, extractInValues, hasFieldFilter, transformFilter } from './index.ts'

describe('e2e: in operator', () => {
  describe('basic in filters', () => {
    it('parses and transforms in filter with strings', () => {
      const result = parse("$filter=parentId in ('root', 'parent-123', 'parent-456')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const parentIds = extractInValues<string>(transformed, 'parentId')

      expect(parentIds).toEqual(['root', 'parent-123', 'parent-456'])
    })

    it('parses and transforms in filter with numbers', () => {
      const result = parse('$filter=categoryId in (1, 2, 3, 4, 5)', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const categoryIds = extractInValues<number>(transformed, 'categoryId')

      expect(categoryIds).toEqual([1, 2, 3, 4, 5])
    })

    it('handles single value in filter', () => {
      const result = parse("$filter=id in ('single')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractInValues<string>(transformed, 'id')).toEqual(['single'])
    })
  })

  describe('extractFieldValues', () => {
    it('uses extractFieldValues for uniform access', () => {
      const result = parse("$filter=status in ('active', 'pending')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const values = extractFieldValues<string>(transformed, 'status')

      expect(values).toEqual(['active', 'pending'])
    })

    it('extractFieldValues handles equality filter', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractFieldValues<string>(transformed, 'status')).toEqual(['active'])
    })

    it('extractFieldValues returns undefined for non-existent field', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractFieldValues(transformed, 'nonexistent')).toBeUndefined()
    })
  })

  describe('hasFieldFilter with in', () => {
    it('hasFieldFilter handles in filters', () => {
      const result = parse("$filter=status in ('a', 'b')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(hasFieldFilter(transformed, 'status')).toBe(true)
    })
  })

  describe('extractInValues edge cases', () => {
    it('extractInValues returns undefined for non-in filter', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractInValues(transformed, 'status')).toBeUndefined()
    })
  })
})
