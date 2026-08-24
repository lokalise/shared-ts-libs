import vm from 'node:vm'
import { EnhancedError } from './EnhancedError.ts'

class A extends EnhancedError {
  override readonly code = 'A';
}

class B extends A {}

class TestError extends Error {}

describe('EnhancedError', () => {
  describe('instanceof behavior in the same realm', () => {
    it('recognizes direct subclass', () => {
      const a = new A({ message: 'test' })

      expect(a.constructor.name).toBe('A')
      expect(a instanceof EnhancedError).toBe(true)
      expect(a instanceof A).toBe(true)
      expect(a instanceof B).toBe(false)
    })

    it('recognizes nested subclass', () => {
      const b = new B({ message: 'test' })

      expect(b.constructor.name).toBe('B')
      expect(b instanceof EnhancedError).toBe(true)
      expect(b instanceof A).toBe(true)
      expect(b instanceof B).toBe(true)
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
      }
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
    const context = vm.createContext({ EnhancedError: EnhancedError })

    vm.runInContext(
        `
      class A extends EnhancedError {}
      class B extends A {}
      globalThis.error = new B('from vm');
    `,
        context,
    )

    const { error } = context

    expect(error instanceof EnhancedError).toBe(true)
    expect(error instanceof A).toBe(true)
    expect(error instanceof B).toBe(true)
  })
})
