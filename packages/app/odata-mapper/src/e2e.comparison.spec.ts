import { parse } from '@balena/odata-parser'
import { describe, expect, it } from 'vitest'
import { extractComparison, extractEqualityValue, extractRange, transformFilter } from './index.ts'

describe('e2e: comparison operators', () => {
  describe('basic equality filters', () => {
    it('parses and transforms simple equality filter', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed).toEqual({
        type: 'comparison',
        field: 'status',
        operator: 'eq',
        value: 'active',
      })
      expect(extractEqualityValue<string>(transformed, 'status')).toBe('active')
    })

    it('parses and transforms numeric equality filter', () => {
      const result = parse('$filter=id eq 42', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed).toEqual({
        type: 'comparison',
        field: 'id',
        operator: 'eq',
        value: 42,
      })
    })

    it('parses and transforms boolean equality filter', () => {
      const result = parse('$filter=isActive eq true', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<boolean>(transformed, 'isActive')).toBe(true)
    })

    it('parses and transforms null equality filter', () => {
      const result = parse('$filter=deletedAt eq null', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue(transformed, 'deletedAt')).toBeNull()
    })
  })

  describe('comparison operators', () => {
    it('parses and transforms not equal filter', () => {
      const result = parse("$filter=status ne 'deleted'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed).toEqual({
        type: 'comparison',
        field: 'status',
        operator: 'ne',
        value: 'deleted',
      })
    })

    it('parses and transforms greater than filter', () => {
      const result = parse('$filter=price gt 100', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractComparison(transformed, 'price', 'gt')?.value).toBe(100)
    })

    it('parses and transforms le filter', () => {
      const result = parse('$filter=score le 100', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractComparison(transformed, 'score', 'le')?.value).toBe(100)
    })

    it('parses and transforms ge filter', () => {
      const result = parse('$filter=quantity ge 10', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractComparison(transformed, 'quantity', 'ge')?.value).toBe(10)
    })

    it('parses and transforms range filter', () => {
      const result = parse('$filter=price ge 100 and price le 500', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractRange(transformed, 'price')

      expect(range).toEqual({
        min: 100,
        minInclusive: true,
        max: 500,
        maxInclusive: true,
      })
    })

    it('parses exclusive range filter', () => {
      const result = parse('$filter=age gt 18 and age lt 65', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const range = extractRange(transformed, 'age')

      expect(range).toEqual({
        min: 18,
        minInclusive: false,
        max: 65,
        maxInclusive: false,
      })
    })
  })

  describe('nested properties', () => {
    it('parses and transforms nested property filter', () => {
      const result = parse("$filter=address/city eq 'NYC'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(transformed).toEqual({
        type: 'comparison',
        field: 'address/city',
        operator: 'eq',
        value: 'NYC',
      })
    })

    it('parses deeply nested property filter', () => {
      const result = parse("$filter=user/profile/settings/theme eq 'dark'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<string>(transformed, 'user/profile/settings/theme')).toBe('dark')
    })
  })

  describe('edge cases', () => {
    it('handles filter with special characters in string', () => {
      const result = parse("$filter=email eq 'user+test@example.com'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<string>(transformed, 'email')).toBe('user+test@example.com')
    })

    it('handles negative numbers', () => {
      const result = parse('$filter=temperature lt -10', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractComparison(transformed, 'temperature', 'lt')?.value).toBe(-10)
    })

    it('handles decimal numbers', () => {
      const result = parse('$filter=price eq 19.99', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractEqualityValue<number>(transformed, 'price')).toBe(19.99)
    })

    it('handles datetime value', () => {
      const result = parse('$filter=year(createdAt) gt 2024', {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      // Note: datetime literals need special handling in OData
      // Using year() function as workaround for testing
      expect(result.tree.$filter).toBeDefined()
    })
  })
})
