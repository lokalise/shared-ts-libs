/**
 * Return a copy of the given array without duplicates.
 *
 * @template T - The type of elements within the array.
 * @param {T[]} array - The array to be deduplicated.
 * @returns {T[]} - Returns param array without duplicates.
 */
export const removeDuplicates = <T extends string | number | boolean | null | undefined | symbol>(
  array: readonly T[],
): T[] => [...new Set(array)]
