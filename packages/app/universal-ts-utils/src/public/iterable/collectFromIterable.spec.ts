import { setTimeout } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
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
  })

  describe('async iterables', () => {
    it('collects items from an async generator', async () => {
      async function* asyncGeneratorWithDelay() {
        yield await Promise.resolve(1)
        await setTimeout(5)
        yield await Promise.resolve(2)
        await setTimeout(5)
        yield await Promise.resolve(3)
        await setTimeout(5)
      }
      const result = await collectFromIterable(asyncGeneratorWithDelay())
      expect(result).toEqual([1, 2, 3])
    })
  })

  it('infer return type depending on input param', () => {
    // TODO
  })
})
