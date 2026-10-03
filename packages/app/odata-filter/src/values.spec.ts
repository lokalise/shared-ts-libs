import { describe, expect, it } from 'vitest'
import { ODataEvaluationError } from './errors.ts'
import type { EvalContext } from './types.ts'
import { assertNoIntegerDivisionByZero, compareValues, triAnd, triNot, triOr } from './values.ts'

const ctx: EvalContext = {
  root: {},
  parserBinds: [] as unknown as EvalContext['parserBinds'],
  aliasBinds: {},
  filter: 'test',
}

describe('compareValues', () => {
  it('implements eq null rules', () => {
    expect(compareValues('eq', null, null)).toBe(true)
    expect(compareValues('eq', null, 1)).toBe(false)
  })

  it('implements ne null rules', () => {
    expect(compareValues('ne', null, null)).toBe(false)
    expect(compareValues('ne', null, 1)).toBe(true)
  })

  it('implements ge/le null rules', () => {
    expect(compareValues('ge', null, null)).toBe(true)
    expect(compareValues('ge', null, 1)).toBe(false)
    expect(compareValues('le', null, null)).toBe(true)
  })

  it('compares numbers and dates', () => {
    expect(compareValues('gt', 2, 1)).toBe(true)
    expect(compareValues('lt', new Date('2020-01-01'), new Date('2021-01-01'))).toBe(true)
  })

  it('returns false for incomparable types', () => {
    expect(compareValues('gt', 'a', 1)).toBe(false)
  })

  it('compares iso date strings', () => {
    expect(compareValues('lt', '2020-01-01', '2021-01-01')).toBe(true)
    expect(compareValues('eq', '2020-06-01', '2020-06-01')).toBe(true)
  })

  it('compares ne consistently with eq for dates', () => {
    const date = new Date('2020-06-01T00:00:00Z')
    expect(compareValues('ne', date, '2020-06-01')).toBe(false)
    expect(compareValues('ne', date, '2021-01-01')).toBe(true)
  })

  it('handles gt/lt with null operands', () => {
    expect(compareValues('gt', null, 1)).toBe(false)
    expect(compareValues('lt', 1, null)).toBe(false)
  })
})

describe('tri-valued logic', () => {
  it('combines with and/or/not', () => {
    expect(triAnd(false, null)).toBe(false)
    expect(triAnd(true, null)).toBe(null)
    expect(triOr(true, null)).toBe(true)
    expect(triOr(false, null)).toBe(null)
    expect(triNot(null)).toBe(null)
  })
})

describe('assertNoIntegerDivisionByZero', () => {
  it('throws for integer div/mod by zero', () => {
    expect(() => assertNoIntegerDivisionByZero('div', 1, 0, ctx)).toThrow(ODataEvaluationError)
    expect(() => assertNoIntegerDivisionByZero('mod', 1, 0, ctx)).toThrow(ODataEvaluationError)
    expect(() => assertNoIntegerDivisionByZero('div', 1.5, 0, ctx)).not.toThrow()
  })
})
