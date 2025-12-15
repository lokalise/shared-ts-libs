import { describe, expect, it } from 'vitest'
import { getFieldPath, isFieldReference, transformFilter } from '../filterTransformer.ts'
import type { FilterTreeNode } from '../types.ts'
import { createBinds } from './testHelpers.ts'

describe('filterTransformer', () => {
  describe('isFieldReference', () => {
    it('returns true for valid field reference', () => {
      expect(isFieldReference({ name: 'fieldName' })).toBe(true)
    })

    it('returns true for nested field reference', () => {
      expect(isFieldReference({ name: 'parent', property: { name: 'child' } })).toBe(true)
    })

    it('returns false for non-object values', () => {
      expect(isFieldReference(null)).toBe(false)
      expect(isFieldReference(undefined)).toBe(false)
      expect(isFieldReference('string')).toBe(false)
    })

    it('returns false for bind reference', () => {
      expect(isFieldReference({ bind: 0 })).toBe(false)
    })

    it('returns false for object without name', () => {
      expect(isFieldReference({ field: 'test' })).toBe(false)
    })
  })

  describe('getFieldPath', () => {
    it('returns simple field name', () => {
      expect(getFieldPath({ name: 'fieldName' })).toBe('fieldName')
    })

    it('returns nested path with default separator', () => {
      expect(getFieldPath({ name: 'parent', property: { name: 'child' } })).toBe('parent/child')
    })

    it('returns deeply nested path', () => {
      expect(
        getFieldPath({
          name: 'a',
          property: { name: 'b', property: { name: 'c' } },
        }),
      ).toBe('a/b/c')
    })

    it('uses custom separator', () => {
      expect(getFieldPath({ name: 'parent', property: { name: 'child' } }, '.')).toBe(
        'parent.child',
      )
    })
  })

  describe('transformFilter', () => {
    describe('comparison operators', () => {
      it('transforms eq operator', () => {
        const tree: FilterTreeNode = ['eq', { name: 'status' }, { bind: 0 }]
        const binds = createBinds([['Text', 'active']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'status',
          operator: 'eq',
          value: 'active',
        })
      })

      it('transforms ne operator', () => {
        const tree: FilterTreeNode = ['ne', { name: 'status' }, { bind: 0 }]
        const binds = createBinds([['Text', 'deleted']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'status',
          operator: 'ne',
          value: 'deleted',
        })
      })

      it('transforms gt operator with number', () => {
        const tree: FilterTreeNode = ['gt', { name: 'price' }, { bind: 0 }]
        const binds = createBinds([['Real', 100]])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'price',
          operator: 'gt',
          value: 100,
        })
      })

      it('transforms ge operator', () => {
        const tree: FilterTreeNode = ['ge', { name: 'quantity' }, { bind: 0 }]
        const binds = createBinds([['Real', 10]])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'quantity',
          operator: 'ge',
          value: 10,
        })
      })

      it('transforms lt operator', () => {
        const tree: FilterTreeNode = ['lt', { name: 'age' }, { bind: 0 }]
        const binds = createBinds([['Real', 18]])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'age',
          operator: 'lt',
          value: 18,
        })
      })

      it('transforms le operator', () => {
        const tree: FilterTreeNode = ['le', { name: 'score' }, { bind: 0 }]
        const binds = createBinds([['Real', 100]])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'score',
          operator: 'le',
          value: 100,
        })
      })

      it('handles reversed operand order (value op field)', () => {
        const tree: FilterTreeNode = ['eq', { bind: 0 }, { name: 'status' }]
        const binds = createBinds([['Text', 'active']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'status',
          operator: 'eq',
          value: 'active',
        })
      })

      it('handles field to field comparison', () => {
        const tree: FilterTreeNode = ['eq', { name: 'field1' }, { name: 'field2' }]
        const binds = createBinds([])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'field1',
          operator: 'eq',
          value: 'field2',
        })
      })

      it('handles nested field paths', () => {
        const tree: FilterTreeNode = [
          'eq',
          { name: 'address', property: { name: 'city' } },
          { bind: 0 },
        ]
        const binds = createBinds([['Text', 'NYC']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'address/city',
          operator: 'eq',
          value: 'NYC',
        })
      })

      it('handles boolean values', () => {
        const tree: FilterTreeNode = ['eq', { name: 'isActive' }, { bind: 0 }]
        const binds = createBinds([['Boolean', true]])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'isActive',
          operator: 'eq',
          value: true,
        })
      })

      it('handles null values', () => {
        const tree: FilterTreeNode = ['eq', { name: 'deletedAt' }, { bind: 0 }]
        const binds = createBinds([['Null', null]])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'comparison',
          field: 'deletedAt',
          operator: 'eq',
          value: null,
        })
      })
    })

    describe('in operator', () => {
      it('transforms in operator with multiple values', () => {
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

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'in',
          field: 'parentId',
          values: ['root', 'parent-123', 'parent-456'],
        })
      })

      it('transforms in operator with single value', () => {
        const tree: FilterTreeNode = ['in', { name: 'status' }, [{ bind: 0 }]]
        const binds = createBinds([['Text', 'active']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'in',
          field: 'status',
          values: ['active'],
        })
      })

      it('transforms in operator with numeric values', () => {
        const tree: FilterTreeNode = ['in', { name: 'categoryId' }, [{ bind: 0 }, { bind: 1 }]]
        const binds = createBinds([
          ['Real', 1],
          ['Real', 2],
        ])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'in',
          field: 'categoryId',
          values: [1, 2],
        })
      })
    })

    describe('logical operators', () => {
      it('transforms and operator', () => {
        const tree: FilterTreeNode = [
          'and',
          ['eq', { name: 'status' }, { bind: 0 }],
          ['gt', { name: 'price' }, { bind: 1 }],
        ]
        const binds = createBinds([
          ['Text', 'active'],
          ['Real', 100],
        ])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'logical',
          operator: 'and',
          filters: [
            { type: 'comparison', field: 'status', operator: 'eq', value: 'active' },
            { type: 'comparison', field: 'price', operator: 'gt', value: 100 },
          ],
        })
      })

      it('transforms or operator', () => {
        const tree: FilterTreeNode = [
          'or',
          ['eq', { name: 'type' }, { bind: 0 }],
          ['eq', { name: 'type' }, { bind: 1 }],
        ]
        const binds = createBinds([
          ['Text', 'A'],
          ['Text', 'B'],
        ])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'logical',
          operator: 'or',
          filters: [
            { type: 'comparison', field: 'type', operator: 'eq', value: 'A' },
            { type: 'comparison', field: 'type', operator: 'eq', value: 'B' },
          ],
        })
      })

      it('transforms nested logical operators', () => {
        const tree: FilterTreeNode = [
          'and',
          ['eq', { name: 'active' }, { bind: 0 }],
          ['or', ['eq', { name: 'type' }, { bind: 1 }], ['eq', { name: 'type' }, { bind: 2 }]],
        ]
        const binds = createBinds([
          ['Boolean', true],
          ['Text', 'A'],
          ['Text', 'B'],
        ])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'logical',
          operator: 'and',
          filters: [
            { type: 'comparison', field: 'active', operator: 'eq', value: true },
            {
              type: 'logical',
              operator: 'or',
              filters: [
                { type: 'comparison', field: 'type', operator: 'eq', value: 'A' },
                { type: 'comparison', field: 'type', operator: 'eq', value: 'B' },
              ],
            },
          ],
        })
      })
    })

    describe('not operator', () => {
      it('transforms not operator', () => {
        const tree: FilterTreeNode = ['not', ['eq', { name: 'deleted' }, { bind: 0 }]]
        const binds = createBinds([['Boolean', true]])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'not',
          filter: { type: 'comparison', field: 'deleted', operator: 'eq', value: true },
        })
      })

      it('transforms not with in operator', () => {
        const tree: FilterTreeNode = ['not', ['in', { name: 'status' }, [{ bind: 0 }, { bind: 1 }]]]
        const binds = createBinds([
          ['Text', 'deleted'],
          ['Text', 'archived'],
        ])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'not',
          filter: { type: 'in', field: 'status', values: ['deleted', 'archived'] },
        })
      })
    })

    describe('string functions', () => {
      it('transforms contains function', () => {
        const tree: FilterTreeNode = ['contains', { name: 'title' }, { bind: 0 }]
        const binds = createBinds([['Text', 'search term']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'string-function',
          function: 'contains',
          field: 'title',
          value: 'search term',
        })
      })

      it('transforms startswith function', () => {
        const tree: FilterTreeNode = ['startswith', { name: 'name' }, { bind: 0 }]
        const binds = createBinds([['Text', 'John']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'string-function',
          function: 'startswith',
          field: 'name',
          value: 'John',
        })
      })

      it('transforms endswith function', () => {
        const tree: FilterTreeNode = ['endswith', { name: 'email' }, { bind: 0 }]
        const binds = createBinds([['Text', '@example.com']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'string-function',
          function: 'endswith',
          field: 'email',
          value: '@example.com',
        })
      })

      it('transforms substringof function with reversed args', () => {
        const tree: FilterTreeNode = ['substringof', { bind: 0 }, { name: 'description' }]
        const binds = createBinds([['Text', 'keyword']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'string-function',
          function: 'substringof',
          field: 'description',
          value: 'keyword',
        })
      })

      it('transforms substringof function with standard args', () => {
        const tree: FilterTreeNode = ['substringof', { name: 'description' }, { bind: 0 }]
        const binds = createBinds([['Text', 'keyword']])

        const result = transformFilter(tree, binds)

        expect(result).toEqual({
          type: 'string-function',
          function: 'substringof',
          field: 'description',
          value: 'keyword',
        })
      })
    })

    describe('error handling', () => {
      it('throws for unsupported node type', () => {
        const tree = ['unknown', { name: 'field' }, { bind: 0 }] as unknown as FilterTreeNode
        const binds = createBinds([['Text', 'value']])

        expect(() => transformFilter(tree, binds)).toThrow('Unsupported filter node')
      })

      it('throws for unsupported comparison operands', () => {
        const tree = ['eq', { bind: 0 }, { bind: 1 }] as unknown as FilterTreeNode
        const binds = createBinds([
          ['Text', 'a'],
          ['Text', 'b'],
        ])

        expect(() => transformFilter(tree, binds)).toThrow('Unsupported comparison operands')
      })
    })
  })
})
