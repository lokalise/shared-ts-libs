import { describe, expect, it } from 'vitest'
import { getFieldPath, resolveFieldValue } from './paths.ts'
import type { EvalContext, FieldReference } from './types.ts'

const ctx: EvalContext = {
  root: { a: { b: 1 }, tags: ['x'], scalar: 's' },
  parserBinds: [] as unknown as EvalContext['parserBinds'],
  aliasBinds: {},
  filter: 'test',
  lambdaVar: 'i',
  lambdaValue: { q: 2 },
}

describe('paths', () => {
  it('builds nested field paths', () => {
    const field: FieldReference = { name: 'a', property: { name: 'b' } }
    expect(getFieldPath(field)).toBe('a/b')
    expect(resolveFieldValue(ctx, field)).toBe(1)
  })

  it('resolves lambda variable paths', () => {
    const field: FieldReference = { name: 'i', property: { name: 'q' } }
    expect(resolveFieldValue(ctx, field)).toBe(2)
  })

  it('returns null for missing and invalid paths', () => {
    expect(resolveFieldValue(ctx, { name: 'missing' })).toBe(null)
    expect(resolveFieldValue(ctx, { name: 'scalar', property: { name: 'x' } })).toBe(null)
    expect(resolveFieldValue(ctx, { name: 'tags', count: true })).toBe(1)
    expect(resolveFieldValue(ctx, { name: 'scalar', count: true })).toBe(null)
    expect(resolveFieldValue(ctx, { name: 'missing', count: true })).toBe(null)
  })
})
