import type { NonEmptyArray } from './nonEmptyArray.ts'

/**
 * Maps over a `NonEmptyArray`, applying the given mapper function to each element,
 * and returns a new `NonEmptyArray` with the mapped values.
 *
 * Unlike the standard `Array.prototype.map`, this function ensures the result
 * retains the `NonEmptyArray` type, preserving the guarantee that the array
 * has at least one element.
 *
 * @template TArrayElement - The type of elements in the input array.
 * @template TMappedValue - The type of elements in the resulting array after mapping.
 * @param {NonEmptyArray<TArrayElement>} array - The non-empty array to be mapped.
 * @param {(value: TArrayElement, index: number, array: TArrayElement[]) => TMappedValue} mapper
 * A function to transform each element of the array.
 * @returns {NonEmptyArray<TMappedValue>} A new `NonEmptyArray` containing the mapped values.
 *
 * @example
 * ```typescript
 * const numbers: NonEmptyArray<number> = [1, 2, 3];
 * const doubled: NonEmptyArray<number> = mapNonEmptyArray(numbers, (x) => x * 2);
 * console.log(doubled); // [2, 4, 6]
 * ```
 */
export const mapNonEmptyArray = <TArrayElement, TMappedValue>(
  array: NonEmptyArray<TArrayElement>,
  mapper: (value: TArrayElement, index: number, array: TArrayElement[]) => TMappedValue,
): NonEmptyArray<TMappedValue> => {
  // Directly cast the result to NonEmptyArray<TMappedValue>, as we know it's non-empty.
  return array.map(mapper) as NonEmptyArray<TMappedValue>
}
