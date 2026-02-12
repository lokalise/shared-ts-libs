import { parse } from '@balena/odata-parser'
import { describe, expect, it } from 'vitest'
import {
  extractEqualityValue,
  extractInValues,
  extractRange,
  extractStringFunction,
  transformFilter,
} from './index.ts'

describe('e2e: complex real-world scenarios', () => {
  describe('parent filter use case', () => {
    it('parses parent filter from user example', () => {
      const result = parse("$filter=parentId in ('root', 'parent-123', 'parent-456')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      // This is the transformation the user was looking for:
      // from low-level AST to useful service-ready data
      const parentFilter = {
        type: 'parent-filter',
        parentIds: extractInValues<string>(transformed, 'parentId'),
      }

      expect(parentFilter).toEqual({
        type: 'parent-filter',
        parentIds: ['root', 'parent-123', 'parent-456'],
      })
    })
  })

  describe('product search', () => {
    it('parses product search filter', () => {
      const result = parse(
        "$filter=category eq 'electronics' and price ge 100 and price le 1000 and contains(name, 'phone')",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<string>(transformed, 'category')).toBe('electronics')
      expect(extractRange(transformed, 'price')).toEqual({
        min: 100,
        minInclusive: true,
        max: 1000,
        maxInclusive: true,
      })
      expect(extractStringFunction(transformed, 'name', 'contains')?.value).toBe('phone')
    })
  })

  describe('user search', () => {
    it('parses user search with multiple criteria', () => {
      const result = parse(
        "$filter=isActive eq true and role in ('admin', 'moderator') and startswith(email, 'support')",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<boolean>(transformed, 'isActive')).toBe(true)
      expect(extractInValues<string>(transformed, 'role')).toEqual(['admin', 'moderator'])
      expect(extractStringFunction(transformed, 'email', 'startswith')?.value).toBe('support')
    })
  })

  describe('inventory filter', () => {
    it('parses inventory filter with multiple conditions', () => {
      const result = parse(
        "$filter=quantity gt 0 and status eq 'available' and categoryId in (1, 2, 3)",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<string>(transformed, 'status')).toBe('available')
      expect(extractInValues<number>(transformed, 'categoryId')).toEqual([1, 2, 3])
    })
  })

  describe('numeric range filter', () => {
    it('parses numeric range filter', () => {
      const result = parse('$filter=year ge 2020 and year lt 2025', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractRange(transformed, 'year')

      expect(range).toBeDefined()
      expect(range?.min).toBe(2020)
      expect(range?.max).toBe(2025)
      expect(range?.minInclusive).toBe(true)
      expect(range?.maxInclusive).toBe(false)
    })
  })

  describe('nested property filter', () => {
    it('parses filter with nested properties', () => {
      const result = parse(
        "$filter=user/profile/status eq 'active' and user/profile/role eq 'admin'",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<string>(transformed, 'user/profile/status')).toBe('active')
      expect(extractEqualityValue<string>(transformed, 'user/profile/role')).toBe('admin')
    })
  })

  describe('combined text search', () => {
    it('parses combined text search filter', () => {
      const result = parse(
        "$filter=contains(title, 'typescript') or contains(description, 'typescript')",
        {
          startRule: 'ProcessRule',
          rule: 'QueryOptions',
        },
      )

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed.type).toBe('logical')
      const titleSearch = extractStringFunction(transformed, 'title', 'contains')
      const descSearch = extractStringFunction(transformed, 'description', 'contains')

      expect(titleSearch?.value).toBe('typescript')
      expect(descSearch?.value).toBe('typescript')
    })
  })
})
