import type { NonObject } from '../types.js'

/**
 * Return a copy of the given array without duplicates.
 *
 * @template T - The type of elements within the array.
 * @param {T[]} array - The array to be deduplicated.
 * @returns {T[]} - Returns param array without duplicates.
 */
export const removeDuplicates = <T extends NonObject>(array: readonly T[]): T[] => [
  ...new Set(array),
]
