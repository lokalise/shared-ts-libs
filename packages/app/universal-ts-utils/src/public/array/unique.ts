/**
 * Returns a new array containing only unique elements from the given array, preserving the order.
 *
 * This function uses a `Set` to store unique elements and then converts it back to an array.
 *
 * @template T - The type of elements in the input array.
 * @param {T[]} arr - The array from which to remove duplicate values.
 * @returns {T[]} - A new array containing only unique elements from the original array.
 *
 * @example
 * ```typescript
 * const numbers = [1, 2, 2, 3, 4, 4, 5]
 * const result = unique(numbers) // Returns: [1, 2, 3, 4, 5]
 * ```
 */
export const unique = <T>(arr: T[]): T[] => Array.from(new Set(arr))
