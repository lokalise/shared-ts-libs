import odataParser from '@balena/odata-parser'

const { parse } = odataParser

import { describe, expect, it } from 'vitest'
import { extractStringFunction, hasFieldFilter, transformFilter } from './index.ts'

describe('e2e: string functions', () => {
  describe('contains function', () => {
    it('parses and transforms contains function', () => {
      const result = parse("$filter=contains(name, 'John')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const strFunc = extractStringFunction(transformed, 'name', 'contains')

      expect(strFunc).toEqual({
        type: 'string-function',
        function: 'contains',
        field: 'name',
        value: 'John',
      })
    })
  })

  describe('startswith function', () => {
    it('parses and transforms startswith function', () => {
      const result = parse("$filter=startswith(email, 'admin')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const strFunc = extractStringFunction(transformed, 'email', 'startswith')

      expect(strFunc?.value).toBe('admin')
    })
  })

  describe('endswith function', () => {
    it('parses and transforms endswith function', () => {
      const result = parse("$filter=endswith(email, '@example.com')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const strFunc = extractStringFunction(transformed, 'email', 'endswith')

      expect(strFunc?.value).toBe('@example.com')
    })
  })

  describe('substringof function', () => {
    it('parses and transforms substringof function', () => {
      const result = parse("$filter=substringof('test', description)", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      const transformed = transformFilter(result.tree.$filter, result.binds)
      const strFunc = extractStringFunction(transformed, 'description', 'substringof')

      expect(strFunc?.value).toBe('test')
    })
  })

  describe('hasFieldFilter with string functions', () => {
    it('hasFieldFilter handles string function filters', () => {
      const result = parse("$filter=contains(name, 'John')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(hasFieldFilter(transformed, 'name')).toBe(true)
      expect(hasFieldFilter(transformed, 'other')).toBe(false)
    })
  })

  describe('extractStringFunction edge cases', () => {
    it('returns undefined for non-existent field', () => {
      const result = parse("$filter=contains(name, 'John')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractStringFunction(transformed, 'nonexistent')).toBeUndefined()
    })

    it('returns undefined for non-matching function', () => {
      const result = parse("$filter=contains(name, 'John')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractStringFunction(transformed, 'name', 'startswith')).toBeUndefined()
    })

    it('finds function without specifying function name', () => {
      const result = parse("$filter=contains(name, 'John')", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilter(result.tree.$filter, result.binds)

      expect(extractStringFunction(transformed, 'name')).toBeDefined()
    })
  })
})
