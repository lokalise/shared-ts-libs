import { compare } from '../../internal/compare'

type KeysMatching<T extends object, V> = {
  [K in keyof T]: T[K] extends V ? K : never
}[keyof T]

/**
 * Sorts an array of objects based on a specified string field and order.
 *
 * @template T - The type of the objects within the array.
 * @template K - The key of T that maps to a string value.
 *
 * @param {T[]} array - The array of objects to be sorted.
 * @param {K} field - The field of the objects which is of type string, used to define the sort criterion.
 * @param {'asc' | 'desc'} [order='asc'] - The order in which to sort the array. Defaults to 'asc'.
 *
 * @returns {T[]} The sorted array of objects.
 *
 * @remarks This function returns a copy of the original array that is sorted according to the specified order.
 * It does not modify the input array, making it safe to use without side effects.
 *
 * @example
 * ```typescript
 * const data = [
 *   { name: 'Zara', age: 22 },
 *   { name: 'Alex', age: 30 },
 *   { name: 'John', age: 25 }
 * ];
 *
 * // Sort by 'name'
 * const sortedByName = sortByField(data, 'name')
 * // Output: [ { name: 'Alex', age: 30 }, { name: 'John', age: 25 }, { name: 'Zara', age: 22 } ]
 * console.log(sortedByName)
 * ```
 */
export const sortByField = <T extends object, K extends KeysMatching<T, string | number>>(
  array: T[],
  field: K,
  order: 'asc' | 'desc' = 'asc',
): T[] => {
  if (array.length < 2) return array

  const copy = [...array]
  return order === 'asc'
    ? copy.sort((a, b) => compare(a[field] as string | number, b[field] as string | number))
    : copy.sort((a, b) => compare(b[field] as string | number, a[field] as string | number))
}
