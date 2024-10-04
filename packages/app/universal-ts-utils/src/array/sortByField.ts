type KeysMatching<T extends object, V> = {
  [K in keyof T]: T[K] extends V ? K : never
}[keyof T]

/*
 TODO: Extend this method more types of fields.
 For now, it only supports fields of type string as it is the most common use case.
 the objective is to use the compare method defined on `sort.ts` but don't want to expose it at this point.

 So in a follow-up will try to come up with a solution to have "internal" not exposed utilities, and then extends this
 method.
*/

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
export const sortByField = <T extends object, K extends KeysMatching<T, string>>(
  array: T[],
  field: K,
  order: 'asc' | 'desc' = 'asc',
): T[] =>
  order === 'asc'
    ? // @ts-expect-error
      array.sort((a, b) => a[field].localeCompare(b[field]))
    : // @ts-expect-error
      array.sort((a, b) => b[field].localeCompare(a[field]))
