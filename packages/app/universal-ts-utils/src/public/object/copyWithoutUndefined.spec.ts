import { describe, expect, expectTypeOf, it } from 'vitest'
import { copyWithoutUndefined } from './copyWithoutUndefined.ts'

describe('copyWithoutUndefined', () => {
  it('removes undefined fields and keeps null, empty and falsy ones', () => {
    const result = copyWithoutUndefined({
      a: undefined,
      b: 'b',
      c: '',
      d: null,
      e: 0,
      f: false,
      g: { nested: undefined },
    })

    expect(result).toStrictEqual({
      b: 'b',
      c: '',
      d: null,
      e: 0,
      f: false,
      g: { nested: undefined },
    })
  })

  it('drops keys typed as undefined but keeps keys that may hold null', () => {
    const result = copyWithoutUndefined({
      a: undefined,
      b: 'b',
      c: null as string | null,
      d: null,
    })

    expectTypeOf(result).toEqualTypeOf<{ b: string; c: string | null; d: null }>()
  })

  it('does not modify the source object', () => {
    const source = { a: undefined, b: 'b' }

    copyWithoutUndefined(source)

    expect(source).toStrictEqual({ a: undefined, b: 'b' })
  })

  it('copies an own __proto__ key as a property without changing the prototype', () => {
    const source = JSON.parse('{"__proto__":{"isAdmin":true},"a":1}')

    const result = copyWithoutUndefined(source)

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(result.isAdmin).toBeUndefined()
    expect(result.a).toBe(1)
  })
})
