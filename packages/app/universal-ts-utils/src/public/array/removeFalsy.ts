/**
 * Removes all falsy values from an array and returns a new array containing only truthy values.
 *
 * @template T - The type of elements in the input array, excluding falsy types.
 * @param {readonly (T | null | undefined | 0 | '' | false)[]} array - The array from which to remove falsy values.
 * @returns {T[]} - A new array containing only the truthy elements of the original array.
 *
 * @example
 * ```typescript
 * const array = [1, 0, 'hello', '', false, true, null, undefined]
 * const result = removeFalsy(array) // returns [1, 'hello', true]
 * ``
 */
export const removeFalsy = <const T>(
  array: readonly (T | null | undefined | 0 | '' | false)[],
): T[] => array.filter((e) => e) as T[]
