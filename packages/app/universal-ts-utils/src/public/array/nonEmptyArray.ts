/**
 * A type representing an array that is guaranteed to have at least one element.
 *
 * This is useful for ensuring operations that depend on the presence of at least one element
 * can be performed safely without additional runtime checks.
 *
 * @template T - The type of elements within the array.
 * @typedef {[T, ...T[]]} NonEmptyArray
 *
 * @example
 * ```typescript
 * const array: NonEmptyArray<number> = [1, 2, 3];
 * console.log(array[0]); // Accessing the first element is safe.
 * ```
 */
export type NonEmptyArray<T> = [T, ...T[]]
