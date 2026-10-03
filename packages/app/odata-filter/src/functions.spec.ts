import { describe, expect, it } from 'vitest'
import { evaluateFunction, isSupportedFunction } from './functions.ts'

describe('evaluateFunction', () => {
  it('evaluates string functions', () => {
    expect(evaluateFunction('concat', ['a', 'b'])).toBe('ab')
    expect(evaluateFunction('contains', ['hello', 'ell'])).toBe(true)
    expect(evaluateFunction('length', ['abc'])).toBe(3)
    expect(evaluateFunction('indexof', ['abc', 'b'])).toBe(1)
    expect(evaluateFunction('substring', ['hello', 1, 2])).toBe('el')
    expect(evaluateFunction('substring', ['hello', 10])).toBe('')
    expect(evaluateFunction('tolower', ['AbC'])).toBe('abc')
    expect(evaluateFunction('toupper', ['AbC'])).toBe('ABC')
    expect(evaluateFunction('trim', ['  x  '])).toBe('x')
  })

  it('returns null when string args are null', () => {
    expect(evaluateFunction('contains', [null, 'x'])).toBe(null)
  })

  it('evaluates date and math functions', () => {
    const date = new Date('2024-06-15T12:30:45.123Z')
    expect(evaluateFunction('year', [date])).toBe(2024)
    expect(evaluateFunction('month', [date])).toBe(6)
    expect(evaluateFunction('day', [date])).toBe(15)
    expect(evaluateFunction('hour', [date])).toBe(12)
    expect(evaluateFunction('now', [])).toBeInstanceOf(Date)
    expect(evaluateFunction('ceiling', [1.2])).toBe(2)
    expect(evaluateFunction('floor', [1.8])).toBe(1)
    expect(evaluateFunction('round', [1.5])).toBe(2)
  })

  it('reports unsupported functions', () => {
    expect(isSupportedFunction('unknown')).toBe(false)
    expect(evaluateFunction('unknown', [])).toBe(null)
  })

  it('covers remaining date helpers', () => {
    const date = new Date('2024-06-15T12:30:45.123Z')
    expect(evaluateFunction('date', [date])).toBeInstanceOf(Date)
    expect(evaluateFunction('time', [date])).toMatchObject({ hours: 12 })
    expect(evaluateFunction('maxdatetime', [])).toBeInstanceOf(Date)
    expect(evaluateFunction('mindatetime', [])).toBeInstanceOf(Date)
    expect(evaluateFunction('totaloffsetminutes', [date])).toBe(0)
    expect(evaluateFunction('totalseconds', [3600])).toBe(3600)
    expect(evaluateFunction('date', [null])).toBe(null)
    expect(evaluateFunction('year', ['not-a-date'])).toBe(null)
  })

  it('covers startswith and substring arity', () => {
    expect(evaluateFunction('startswith', ['abc', 'a'])).toBe(true)
    expect(evaluateFunction('substring', ['hello', 1])).toBe('ello')
    expect(evaluateFunction('indexof', [null, 'a'])).toBe(null)
    expect(evaluateFunction('length', [123])).toBe(null)
  })
})
