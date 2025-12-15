import { describe, expect, it } from 'vitest'
import { getBindKey, isBindReference, resolveBind, resolveBinds } from '../bindResolver.ts'
import { createBinds, createBindsWithAliases } from './testHelpers.ts'

describe('bindResolver', () => {
  describe('resolveBind', () => {
    it('resolves Text bind', () => {
      const binds = createBinds([['Text', 'hello']])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toBe('hello')
    })

    it('resolves Real bind', () => {
      const binds = createBinds([['Real', 42]])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toBe(42)
    })

    it('resolves Boolean bind', () => {
      const binds = createBinds([['Boolean', true]])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toBe(true)
    })

    it('resolves Date bind with Date object', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const binds = createBinds([['Date', date]])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toEqual(date)
    })

    it('resolves Date bind with string', () => {
      const binds = createBinds([['Date', '2024-01-15T10:30:00Z']])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toBeInstanceOf(Date)
      expect((result as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z')
    })

    it('resolves Date Time bind', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const binds = createBinds([['Date Time', date]])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toEqual(date)
    })

    it('resolves Null bind', () => {
      const binds = createBinds([['Null', null]])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toBeNull()
    })

    it('resolves Duration bind', () => {
      const binds = createBinds([['Duration', 'PT1H30M']])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toBe('PT1H30M')
    })

    it('resolves unknown type as-is', () => {
      const binds = createBinds([['Custom', 'value']])
      const result = resolveBind(binds, { bind: 0 })
      expect(result).toBe('value')
    })

    it('throws for invalid bind reference', () => {
      const binds = createBinds([['Text', 'hello']])
      expect(() => resolveBind(binds, { bind: 5 })).toThrow('Invalid bind reference: 5')
    })

    it('resolves parameter alias bind', () => {
      const binds = createBindsWithAliases([['Text', 'default']], {
        '@param1': ['Text', 'aliased'],
      })
      const result = resolveBind(binds, { bind: '@param1' })
      expect(result).toBe('aliased')
    })
  })

  describe('resolveBinds', () => {
    it('resolves multiple binds', () => {
      const binds = createBinds([
        ['Text', 'hello'],
        ['Real', 42],
        ['Boolean', true],
      ])
      const result = resolveBinds(binds, [{ bind: 0 }, { bind: 1 }, { bind: 2 }])
      expect(result).toEqual(['hello', 42, true])
    })

    it('returns empty array for empty refs', () => {
      const binds = createBinds([['Text', 'hello']])
      const result = resolveBinds(binds, [])
      expect(result).toEqual([])
    })
  })

  describe('isBindReference', () => {
    it('returns true for numeric bind reference', () => {
      expect(isBindReference({ bind: 0 })).toBe(true)
      expect(isBindReference({ bind: 5 })).toBe(true)
    })

    it('returns true for parameter alias bind reference', () => {
      expect(isBindReference({ bind: '@param1' })).toBe(true)
      expect(isBindReference({ bind: '@myAlias' })).toBe(true)
    })

    it('returns false for non-object values', () => {
      expect(isBindReference(null)).toBe(false)
      expect(isBindReference(undefined)).toBe(false)
      expect(isBindReference('string')).toBe(false)
      expect(isBindReference(123)).toBe(false)
    })

    it('returns false for object without bind property', () => {
      expect(isBindReference({})).toBe(false)
      expect(isBindReference({ name: 'field' })).toBe(false)
    })

    it('returns false for invalid bind property type', () => {
      expect(isBindReference({ bind: 'notAlias' })).toBe(false)
      expect(isBindReference({ bind: null })).toBe(false)
    })
  })

  describe('getBindKey', () => {
    it('returns numeric key', () => {
      expect(getBindKey({ bind: 0 })).toBe(0)
      expect(getBindKey({ bind: 5 })).toBe(5)
    })

    it('returns parameter alias key', () => {
      expect(getBindKey({ bind: '@param1' })).toBe('@param1')
    })
  })
})
