/**
 * Checks if the given array is non-empty.
 *
 * This function is a type guard that not only checks whether the array has at least one element,
 * but also refines the type of the array to be a tuple indicating that the first element exists.
 * This is useful for preventing operations on empty arrays and for gaining type-level assurances.
 *
 * @template T - The type of elements within the array.
 * @param {T[]} array - The array to be checked, which should be read-only.
 * @returns {array is [T, ...T[]]} - Returns true if the array is non-empty, false otherwise.
 */
export const isNonEmptyArray = <T>(array: T[]): array is [T, ...T[]] => array.length > 0
