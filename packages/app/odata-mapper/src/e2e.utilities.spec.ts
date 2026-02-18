import odataParser from '@balena/odata-parser'

const { parse } = odataParser

import { describe, expect, it } from 'vitest'
import {
  extractBindTupleValue,
  extractBindTupleValues,
  getBindKey,
  getFieldPath,
  isBindReference,
  isFieldReference,
  resolveBind,
  resolveBinds,
  transformFilterNode,
} from './index.ts'

describe('e2e: utilities', () => {
  describe('bind resolver utilities', () => {
    it('isBindReference returns true for numeric bind', () => {
      expect(isBindReference({ bind: 0 })).toBe(true)
      expect(isBindReference({ bind: 5 })).toBe(true)
    })

    it('isBindReference returns true for parameter alias', () => {
      expect(isBindReference({ bind: '@param1' })).toBe(true)
    })

    it('isBindReference returns false for non-bind values', () => {
      expect(isBindReference(null)).toBe(false)
      expect(isBindReference(undefined)).toBe(false)
      expect(isBindReference('string')).toBe(false)
      expect(isBindReference(123)).toBe(false)
      expect(isBindReference({})).toBe(false)
      expect(isBindReference({ name: 'field' })).toBe(false)
      expect(isBindReference({ bind: 'notAlias' })).toBe(false)
      expect(isBindReference({ bind: null })).toBe(false)
    })

    it('getBindKey returns the bind key', () => {
      expect(getBindKey({ bind: 0 })).toBe(0)
      expect(getBindKey({ bind: '@param1' })).toBe('@param1')
    })

    it('resolveBind resolves different bind types', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      expect(resolveBind(result.binds, { bind: 0 })).toBe('active')
    })

    it('resolveBind throws for invalid bind reference', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      expect(() => resolveBind(result.binds, { bind: 999 })).toThrow('Invalid bind reference')
    })

    it('resolveBinds resolves multiple binds', () => {
      const result = parse("$filter=a eq 'x' and b eq 'y'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      expect(resolveBinds(result.binds, [{ bind: 0 }, { bind: 1 }])).toEqual(['x', 'y'])
    })

    it('resolveBinds returns empty array for empty refs', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      expect(resolveBinds(result.binds, [])).toEqual([])
    })
  })

  describe('extractBindTupleValue', () => {
    it('extracts value from tuple', () => {
      expect(extractBindTupleValue(['Text', 'hello'])).toBe('hello')
      expect(extractBindTupleValue(['Real', 42])).toBe(42)
      expect(extractBindTupleValue(['Boolean', true])).toBe(true)
      expect(extractBindTupleValue(['Null', null])).toBeNull()
      expect(extractBindTupleValue(['Duration', 'PT1H30M'])).toBe('PT1H30M')
      expect(extractBindTupleValue(['Custom', 'value'])).toBe('value')
    })

    it('handles Date types', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      expect(extractBindTupleValue(['Date', date])).toEqual(date)
      expect(extractBindTupleValue(['Date Time', date])).toEqual(date)

      const result = extractBindTupleValue(['Date', '2024-01-15T10:30:00Z'])
      expect(result).toBeInstanceOf(Date)
    })
  })

  describe('extractBindTupleValues', () => {
    it('extracts values from array of tuples', () => {
      const tuples = [
        ['Text', 'hello'],
        ['Real', 42],
        ['Boolean', true],
      ]
      expect(extractBindTupleValues(tuples)).toEqual(['hello', 42, true])
    })

    it('returns empty array for non-array', () => {
      expect(extractBindTupleValues(null)).toEqual([])
      expect(extractBindTupleValues('string')).toEqual([])
    })

    it('returns array as-is if not tuples', () => {
      expect(extractBindTupleValues(['hello', 'world'])).toEqual(['hello', 'world'])
    })
  })

  describe('field reference utilities', () => {
    it('isFieldReference returns true for field reference', () => {
      expect(isFieldReference({ name: 'fieldName' })).toBe(true)
      expect(isFieldReference({ name: 'parent', property: { name: 'child' } })).toBe(true)
    })

    it('isFieldReference returns false for non-field values', () => {
      expect(isFieldReference(null)).toBe(false)
      expect(isFieldReference(undefined)).toBe(false)
      expect(isFieldReference('string')).toBe(false)
      expect(isFieldReference({ bind: 0 })).toBe(false)
      expect(isFieldReference({ field: 'test' })).toBe(false)
    })

    it('getFieldPath returns simple field name', () => {
      expect(getFieldPath({ name: 'fieldName' })).toBe('fieldName')
    })

    it('getFieldPath returns nested path with default separator', () => {
      expect(getFieldPath({ name: 'parent', property: { name: 'child' } })).toBe('parent/child')
    })

    it('getFieldPath returns deeply nested path', () => {
      expect(
        getFieldPath({
          name: 'a',
          property: { name: 'b', property: { name: 'c' } },
        }),
      ).toBe('a/b/c')
    })

    it('getFieldPath uses custom separator', () => {
      expect(getFieldPath({ name: 'parent', property: { name: 'child' } }, '.')).toBe(
        'parent.child',
      )
    })
  })

  describe('transformFilterNode', () => {
    it('transforms filter node with options', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })
      const transformed = transformFilterNode(result.tree.$filter, result.binds, {})

      expect(transformed.type).toBe('comparison')
    })

    it('throws for unsupported filter node', () => {
      const result = parse("$filter=status eq 'active'", {
        startRule: 'ProcessRule',
        rule: 'QueryOptions',
      })

      expect(() => transformFilterNode(['unknown', {}, {}] as never, result.binds)).toThrow(
        'Unsupported filter node',
      )
    })
  })
})
