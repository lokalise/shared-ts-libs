import { describe, expect, it } from 'vitest'
import { UnsupportedConstructError } from './errors.ts'
import { assertSupportedTree, evaluateExpression, matchesFilter } from './evaluate.ts'
import { parseFilterQuery } from './parser.ts'
import type { EvalContext } from './types.ts'

function makeCtx(
  filter: string,
  root: Record<string, unknown>,
  binds = parseFilterQuery(filter).binds,
): EvalContext {
  return {
    root,
    parserBinds: binds,
    aliasBinds: {},
    filter,
  }
}

describe('evaluate', () => {
  it('evaluates all lambda on empty collection as true', () => {
    const tree = parseFilterQuery('tags/all(t:t eq true)').tree
    expect(matchesFilter(makeCtx('tags/all(t:t eq true)', { tags: [] }), tree)).toBe(true)
  })

  it('evaluates all lambda with null when predicate is null', () => {
    const tree = parseFilterQuery('tags/all(t:t/unknown eq 1)').tree
    expect(matchesFilter(makeCtx('tags/all(t:t/unknown eq 1)', { tags: [{ x: 1 }] }), tree)).toBe(
      false,
    )
  })

  it('evaluates lambda on non-array as false', () => {
    const tree = parseFilterQuery('tags/any()').tree
    const c = makeCtx('tags/any()', { tags: 'nope' })
    expect(matchesFilter(c, tree)).toBe(false)
  })

  it('evaluates lambda on null collection as null/false', () => {
    const tree = parseFilterQuery('tags/any()').tree
    expect(matchesFilter(makeCtx('tags/any()', {}), tree)).toBe(false)
  })

  it('rejects unsupported collection methods', () => {
    const field = { name: 'x', method: ['call', { method: 'count', args: [] }] }
    expect(() => evaluateExpression(makeCtx('x', {}), field as never)).toThrow(
      UnsupportedConstructError,
    )
  })

  it('rejects unknown functions in call nodes', () => {
    const tree = ['call', { method: 'unknownFn', args: [] }]
    expect(() => evaluateExpression(makeCtx('x', {}), tree as never)).toThrow(
      UnsupportedConstructError,
    )
  })

  it('rejects unsupported expression nodes', () => {
    expect(() => evaluateExpression(makeCtx('x', {}), Symbol('bad') as never)).toThrow()
  })

  it('assertSupportedTree rejects in and substringof', () => {
    expect(() => assertSupportedTree(['eqany', { name: 'a' }, { bind: 0 }] as never, 'f')).toThrow(
      UnsupportedConstructError,
    )
    expect(() =>
      assertSupportedTree(['call', { method: 'substringof', args: [] }] as never, 'f'),
    ).toThrow(UnsupportedConstructError)
  })

  it('evaluates arithmetic with null operands', () => {
    const tree = parseFilterQuery('price add missing eq null').tree
    expect(matchesFilter(makeCtx('price add missing eq null', { price: 1 }), tree)).toBe(true)
  })

  it('evaluates call functions used as boolean filters', () => {
    const tree = parseFilterQuery("endswith(name, 'e')").tree
    expect(matchesFilter(makeCtx("endswith(name, 'e')", { name: 'Alice' }), tree)).toBe(true)
  })

  it('evaluates n-ary or', () => {
    const tree = parseFilterQuery('a eq 1 or b eq 2 or c eq 3').tree
    expect(matchesFilter(makeCtx('a eq 1 or b eq 2 or c eq 3', { b: 2 }), tree)).toBe(true)
  })

  it('evaluates substring with negative length as error', () => {
    const filter = "substring(name, 0, -1) eq ''"
    const tree = parseFilterQuery(filter).tree
    expect(() => matchesFilter(makeCtx(filter, { name: 'a' }), tree)).toThrow()
  })

  it('rejects unsupported lambda operator at runtime', () => {
    const field = {
      name: 'tags',
      lambda: { method: 'nope' as 'any', identifier: 't', expression: ['eq', null, null] },
    }
    expect(() => evaluateExpression(makeCtx('x', { tags: [] }), field as never)).toThrow(
      UnsupportedConstructError,
    )
  })

  it('rejects rejected operators during evaluation', () => {
    expect(() => evaluateExpression(makeCtx('x', {}), ['has', null, null] as never)).toThrow(
      UnsupportedConstructError,
    )
  })
})
