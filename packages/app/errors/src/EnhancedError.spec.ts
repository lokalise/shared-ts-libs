import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { EnhancedError } from './EnhancedError.ts'

class A extends EnhancedError {
  override readonly code = 'A'
}

class B extends A {}

class TestError extends Error {}

describe('EnhancedError', () => {
  describe('instanceof and isInstance behavior in the same realm', () => {
    it('recognizes direct subclass', () => {
      const a = new A({ message: 'test' })

      expect(a.constructor.name).toBe('A')
      expect(a instanceof Error).toBe(true)
      expect(a instanceof EnhancedError).toBe(true)
      expect(a instanceof A).toBe(true)
      expect(a instanceof B).toBe(false)
      expect(EnhancedError.isInstance(a)).toBe(true)
      expect(A.isInstance(a)).toBe(true)
      expect(B.isInstance(a)).toBe(false)
    })

    it('recognizes nested subclass', () => {
      const b = new B({ message: 'test' })

      expect(b.constructor.name).toBe('B')
      expect(b instanceof EnhancedError).toBe(true)
      expect(b instanceof A).toBe(true)
      expect(b instanceof B).toBe(true)
      expect(EnhancedError.isInstance(b)).toBe(true)
      expect(A.isInstance(b)).toBe(true)
      expect(B.isInstance(b)).toBe(true)
    })

    it('is falsy for non error and unrelated values', () => {
      const values = [
        1,
        'string',
        true,
        false,
        null,
        undefined,
        Symbol('sym'),
        BigInt(123),
        [],
        {},
        () => {},
        class {},
        new Error('regular error'),
        new TypeError('type error'),
        new Date(),
        /regex/,
        new Map(),
        new Set(),
        new WeakMap(),
        new WeakSet(),
        new Promise(() => {}),
      ]

      for (const val of values) {
        expect(val instanceof EnhancedError).toBe(false)
        expect(val instanceof A).toBe(false)
        expect(val instanceof B).toBe(false)
        expect(EnhancedError.isInstance(val)).toBe(false)
        expect(A.isInstance(val)).toBe(false)
        expect(B.isInstance(val)).toBe(false)
      }
    })
  })

  describe('unnamed classes in the prototype chain', () => {
    // Assigning the result of a call does not trigger JS name inference,
    // so the returned class expression has name === ''.
    const createAnonymousError = () =>
      class extends EnhancedError {
        override readonly code = 'ANONYMOUS'
      }

    it('throws when the instantiated class is unnamed', () => {
      const AnonymousError = createAnonymousError()

      expect(AnonymousError.name).toBe('')
      expect(() => new AnonymousError({ message: 'test' })).toThrow(
        /every class in the prototype chain must have a name/,
      )
    })

    it('throws when an unnamed class sits in the middle of the chain', () => {
      class NamedLeafError extends createAnonymousError() {}

      expect(() => new NamedLeafError({ message: 'test' })).toThrow(
        /every class in the prototype chain must have a name/,
      )
    })

    it('works when a factory-created class is explicitly named', () => {
      const NamedError = createAnonymousError()
      Object.defineProperty(NamedError, 'name', { value: 'NamedError' })

      const err = new NamedError({ message: 'test' })

      expect(err instanceof NamedError).toBe(true)
      expect(err instanceof EnhancedError).toBe(true)
      expect(NamedError.isInstance(err)).toBe(true)
      expect(EnhancedError.isInstance(err)).toBe(true)
    })
  })

  describe('constructor behavior', () => {
    class WithDetails extends EnhancedError<{ query: string }> {
      override readonly code = 'WITH_DETAILS'
    }

    it('sets message', () => {
      expect(new A({ message: 'boom' }).message).toBe('boom')
    })

    it('sets name to the concrete class name', () => {
      expect(new B({ message: 'test' }).name).toBe('B')
    })

    it('includes a stack trace', () => {
      expect(new A({ message: 'test' }).stack).toBeDefined()
    })

    it('details is undefined when not provided', () => {
      expect(new A({ message: 'test' }).details).toBeUndefined()
    })

    it('carries typed details when provided', () => {
      expect(new WithDetails({ message: 'test', details: { query: 'SELECT 1' } }).details).toEqual({
        query: 'SELECT 1',
      })
    })
  })

  describe('cause', () => {
    it('has no own cause property when cause is not provided', () => {
      expect('cause' in new A({ message: 'test' })).toBe(false)
    })

    it('forwards cause when provided', () => {
      const cause = new Error('root')
      expect(new A({ message: 'test', cause }).cause).toBe(cause)
    })
  })

  it('recognizes an object carrying the shared path symbols without a prototype link', () => {
    // Simulates an instance created in another realm (or by a duplicated copy
    // of this package): same Symbol.for markers, unrelated prototype chain.
    class Unstamped extends EnhancedError {
      override readonly code = 'UNSTAMPED'
    }

    const foreign = {}
    const paths = [
      '@lokalise/errors.EnhancedError',
      '@lokalise/errors.EnhancedError.A',
      '@lokalise/errors.EnhancedError.A.B',
    ]
    for (const path of paths) {
      Object.defineProperty(foreign, Symbol.for(path), { value: true })
    }

    expect(foreign instanceof B).toBe(true)
    expect(foreign instanceof A).toBe(true)
    expect(foreign instanceof EnhancedError).toBe(true)
    expect(foreign instanceof Unstamped).toBe(false)
    expect(B.isInstance(foreign)).toBe(true)
    expect(A.isInstance(foreign)).toBe(true)
    expect(EnhancedError.isInstance(foreign)).toBe(true)
    expect(Unstamped.isInstance(foreign)).toBe(false)
  })

  it('fails instanceof across vm contexts when using Error subclass', () => {
    const context = vm.createContext({ Error })

    vm.runInContext(
      `
      class TestError extends Error {}
      globalThis.error = new TestError('from vm');
    `,
      context,
    )

    const { error } = context

    expect(error instanceof Error).toBe(true)
    expect(error instanceof TestError).toBe(false)
  })

  it('supports instanceof across vm contexts when using EnhancedError subclass', () => {
    const context = vm.createContext({ EnhancedError })

    vm.runInContext(
      `
      class A extends EnhancedError {}
      class B extends A {}
      globalThis.error = new B({ message: 'from vm' });
    `,
      context,
    )

    const { error } = context

    // The outer A and B match the vm's A and B by symbol name path, not by
    // reference. That name-based matching is the mechanism under test.
    expect(error instanceof EnhancedError).toBe(true)
    expect(error instanceof A).toBe(true)
    expect(error instanceof B).toBe(true)
    expect(EnhancedError.isInstance(error)).toBe(true)
    expect(A.isInstance(error)).toBe(true)
    expect(B.isInstance(error)).toBe(true)
  })
})
