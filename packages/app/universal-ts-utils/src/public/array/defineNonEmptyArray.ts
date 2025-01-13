import type { NonEmptyArray } from './nonEmptyArray.js'

/**
 * Ensures that the given array is treated as a `NonEmptyArray` type.
 *
 * This function doesn't modify the array but provides a type-level guarantee that the array is non-empty,
 * which is useful when TypeScript cannot automatically infer that the array has at least one element.
 *
 * It's a simple way to assert that the array you are working with is indeed a `NonEmptyArray`, without
 * performing any runtime checks. The function assumes the input is already a non-empty array.
 *
 * @template T - The type of elements within the array.
 * @param {NonEmptyArray<T>} array - The non-empty array to be asserted.
 * @returns {NonEmptyArray<T>} The same non-empty array, asserted as `NonEmptyArray`.
 *
 * @example
 * ```typescript
 * const arr = defineNonEmptyArray([{ some: 'value' }]);
 * // arr is typed as NonEmptyArray<{ some: string }>
 * ```
 */
export const defineNonEmptyArray = <T>(array: NonEmptyArray<T>): NonEmptyArray<T> => array
