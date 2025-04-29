import type { KeysMatching, RecordKeyType } from '../../internal/types.ts'

/**
 * Groups an array of objects based on the value of a specified key.
 *
 * This function iterates over the input array and organizes the objects into groups, where each group is associated
 * with a unique key value obtained from the specified selector.
 *
 * @template T - The type of objects contained in the input array.
 * @template K - The type of the key used for grouping, which must match the properties of type `T`.
 * @param {T[]} array - The array of objects to be grouped.
 * @param {K} selector - The property key used to determine the grouping. This key must exist in the objects.
 * @returns {Record<RecordKeyType, T[]>} An object where the keys are the unique values of the specified property from the objects, and the values are arrays of objects that have the respective key value.
 *
 * @example
 * ```typescript
 * const users = [
 *   { name: 'Alice', age: 30 },
 *   { name: 'Bob', age: 25 },
 *   { name: 'Charlie', age: 30 }
 * ]
 * const groupedByAge = groupBy(users, 'age')
 * // Returns:{
 * //   25: [{ name: 'Bob', age: 25 }],
 * //   30: [{ name: 'Alice', age: 30 }, { name: 'Charlie', age: 30 }]
 * // }
 * ```
 */
export const groupBy = <
  T extends object,
  K extends KeysMatching<T, RecordKeyType | null | undefined>,
>(
  array: T[],
  selector: K,
): Record<RecordKeyType, T[]> => {
  return array.reduce(
    (acc, item) => {
      const key = item[selector] as RecordKeyType | null | undefined
      if (key === undefined || key === null) {
        return acc
      }
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(item)
      return acc
    },
    {} as Record<RecordKeyType, T[]>,
  )
}
