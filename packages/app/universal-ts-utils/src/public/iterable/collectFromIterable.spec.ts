import { setTimeout } from 'node:timers/promises'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { collectFromIterable } from './collectFromIterable.ts'

describe('collectFromIterable', () => {
  describe('sync iterables', () => {
    it('collects items from array', () => {
      const array = [1, 2, 3, 4, 5]
      const result = collectFromIterable(array)
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    it('collects items from a Set', () => {
      const set = new Set([1, 2, 3, 4, 5])
      const result = collectFromIterable(set)
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    it('collects items from a custom synchronous iterable', () => {
      const customIterable = {
        *[Symbol.iterator]() {
          yield 1
          yield 2
          yield 3
        },
      }
      const result = collectFromIterable(customIterable)
      expect(result).toEqual([1, 2, 3])
    })

    it('collects items from an empty async generator', async () => {
      async function* emptyAsyncGenerator() {
        // No yields
      }
      const result = await collectFromIterable(emptyAsyncGenerator())
      expect(result).toEqual([])
    })

    it('handles mixed types correctly', () => {
      const mixedArray = ['hello', 42, true, null, undefined, { hello: 'world' }]
      const result = collectFromIterable(mixedArray)
      expect(result).toEqual(['hello', 42, true, null, undefined, { hello: 'world' }])
    })

    it('should infer return type properly', () => {
      const result = collectFromIterable([1, 2, 3])
      expectTypeOf(result).toEqualTypeOf<number[]>()
      expectTypeOf(result).not.toEqualTypeOf<Promise<number[]>>()
    })
  })

  describe('async iterables', () => {
    async function* asyncGenerator() {
      yield await Promise.resolve(1)
      await setTimeout(5)
      yield await Promise.resolve(2)
      await setTimeout(5)
      yield await Promise.resolve(3)
      await setTimeout(5)
    }

    it('collects items from an async generator', async () => {
      const result = await collectFromIterable(asyncGenerator())
      expect(result).toEqual([1, 2, 3])
    })

    it('should infer return type properly', () => {
      const result = collectFromIterable(asyncGenerator())
      expectTypeOf(result).toEqualTypeOf<Promise<number[]>>()
      expectTypeOf(result).not.toEqualTypeOf<number[]>()
    })
  })
})
