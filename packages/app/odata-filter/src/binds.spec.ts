import { describe, expect, it } from 'vitest'
import { isBindReference, resolveBindReference } from './binds.ts'
import type { EvalContext } from './types.ts'

const baseCtx: EvalContext = {
  root: {},
  parserBinds: [
    ['Text', 'hello'],
    ['Real', 42],
    ['Boolean', true],
    ['Date Time', '2024-01-01T00:00:00Z'],
    ['Null', null],
    ['Duration', 'P1D'],
    ['Custom', 'raw'],
  ] as EvalContext['parserBinds'],
  aliasBinds: { term: 'coffee' },
  filter: 'test',
}

describe('binds', () => {
  it('identifies bind references', () => {
    expect(isBindReference({ bind: 0 })).toBe(true)
    expect(isBindReference({ bind: '@term' })).toBe(true)
    expect(isBindReference({ bind: 'bad' })).toBe(false)
    expect(isBindReference(null)).toBe(false)
  })

  it('resolves parser binds of each type', () => {
    expect(resolveBindReference(baseCtx, { bind: 0 })).toBe('hello')
    expect(resolveBindReference(baseCtx, { bind: 1 })).toBe(42)
    expect(resolveBindReference(baseCtx, { bind: 2 })).toBe(true)
    expect(resolveBindReference(baseCtx, { bind: 3 })).toBeInstanceOf(Date)
    expect(resolveBindReference(baseCtx, { bind: 4 })).toBe(null)
    expect(resolveBindReference(baseCtx, { bind: 5 })).toBe('P1D')
    expect(resolveBindReference(baseCtx, { bind: 6 })).toBe('raw')
  })

  it('resolves alias binds and missing values', () => {
    expect(resolveBindReference(baseCtx, { bind: '@term' })).toBe('coffee')
    expect(resolveBindReference(baseCtx, { bind: '@missing' })).toBe(null)
    expect(resolveBindReference(baseCtx, { bind: 99 })).toBe(null)
  })
})
