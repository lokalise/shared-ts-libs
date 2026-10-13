import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  type DefiniteEither,
  type Either,
  failure,
  isFailure,
  isSuccess,
  success,
} from './either.ts'

const parsePort = (value: string): Either<'NOT_A_NUMBER', number> => {
  const port = Number(value)
  return Number.isNaN(port) ? failure('NOT_A_NUMBER') : success(port)
}

describe('either', () => {
  it('reports a failure and narrows to the error', () => {
    const port = parsePort('abc')

    expect(isFailure(port)).toBe(true)
    expect(isSuccess(port)).toBe(false)
    if (isFailure(port)) {
      expectTypeOf(port.error).toEqualTypeOf<'NOT_A_NUMBER'>()
      expect(port.error).toBe('NOT_A_NUMBER')
    }
  })

  it('reports a success and narrows to the result', () => {
    const port = parsePort('8080')

    expect(isSuccess(port)).toBe(true)
    expect(isFailure(port)).toBe(false)
    if (isSuccess(port)) {
      expectTypeOf(port.result).toEqualTypeOf<number>()
      expect(port.result).toBe(8080)
    }
  })

  it('treats falsy results and errors as set', () => {
    expect(isSuccess(success(0))).toBe(true)
    expect(isSuccess(success(false))).toBe(true)
    expect(isFailure(failure(''))).toBe(true)
  })

  it('keeps literal types of the error and the result', () => {
    expectTypeOf(failure('NOT_FOUND').error).toEqualTypeOf<'NOT_FOUND'>()
    expectTypeOf(success({ id: 1 }).result).toEqualTypeOf<{ readonly id: 1 }>()
  })

  it('does not allow an error and a result at the same time', () => {
    expectTypeOf({ error: 'E', result: 1 }).not.toMatchTypeOf<Either<string, number>>()
  })

  it('allows a definite either to carry an error next to its result', () => {
    expectTypeOf({ error: 'PARTIAL', result: 1 }).toMatchTypeOf<DefiniteEither<string, number>>()
    expectTypeOf({ error: 'PARTIAL' }).not.toMatchTypeOf<DefiniteEither<string, number>>()
  })
})
