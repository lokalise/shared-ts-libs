/**
 * Removes all nullish values from an array and returns a new array containing only non-nullish elements.
 *
 * @template T - The type of elements in the input array, excluding nullish types.
 * @param {readonly (T | null | undefined)[]} array - The array from which to remove nullish values.
 * @returns {T[]} - A new array containing only the non-nullish elements of the original array.
 *
 * @example
 * ```typescript
 * const array = [1, null, 'hello', undefined, true, false, '']
 * const result = removeNullish(array) // Returns: [1, 'hello', true, false, '']
 * ```
 */
export const removeNullish = <const T>(array: readonly (T | null | undefined)[]): T[] =>
  array.filter((e) => e !== undefined && e !== null) as T[]
