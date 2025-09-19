/**
 * Collects all items from an iterable or async iterable into an array.
 *
 * This function handles both synchronous and asynchronous iterables. For synchronous
 * iterables, it returns the array directly. For asynchronous iterables, it returns
 * a Promise that resolves to an array containing all items.
 *
 * @template T - The type of elements in the iterable.
 * @param {Iterable<T>} iterable - A synchronous iterable to collect from.
 * @returns {T[]} - An array containing all items from the iterable.
 * @param {AsyncIterable<T>} iterable - An asynchronous iterable to collect from.
 * @returns {Promise<T[]>} - A Promise that resolves to an array containing all items from the iterable.
 *
 * @example
 * ```typescript
 * // With synchronous iterable - returns array directly
 * const syncIterable = [1, 2, 3, 4, 5]
 * const result1 = collectFromIterable(syncIterable) // Returns: [1, 2, 3, 4, 5]
 *
 * // With async iterable - returns Promise
 * async function* asyncGenerator() {
 *   yield 1
 *   yield 2
 *   yield 3
 * }
 * const result2 = await collectFromIterable(asyncGenerator()) // Returns: Promise<[1, 2, 3]>
 * ```
 */
export function collectFromIterable<T>(iterable: Iterable<T>): T[]
export function collectFromIterable<T>(iterable: AsyncIterable<T>): Promise<T[]>
export function collectFromIterable<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): T[] | Promise<T[]> {
  return isAsyncIterable(iterable) ? handleAsyncIterable(iterable) : Array.from(iterable)
}

const handleAsyncIterable = async <T>(iterable: AsyncIterable<T>) => {
  const result: T[] = []
  for await (const item of iterable) {
    result.push(item)
  }

  return result
}

const isAsyncIterable = <T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): iterable is AsyncIterable<T> =>
  iterable && typeof iterable === 'object' && Symbol.asyncIterator in iterable
