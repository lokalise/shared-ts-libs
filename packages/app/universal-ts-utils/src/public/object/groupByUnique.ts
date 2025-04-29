import type { KeysMatching, RecordKeyType } from '../../internal/types.ts'

/**
 * Groups an array of objects based on the unique value of a specified key.
 *
 * This function iterates over the input array and organizes the objects into groups, where each group is associated
 * with a unique key value obtained from the specified selector. If a duplicate key value is encountered, an error is
 * thrown, ensuring the uniqueness of each key in the output.
 *
 * @template T - The type of objects contained in the input array.
 * @template K - The type of the key used for grouping, which must match the properties of type `T`.
 * @param {T[]} array - The array of objects to be grouped.
 * @param {K} selector - The property key used to determine the grouping. This key must exist in the objects.
 * @returns {Record<RecordKeyType, T>} An object where the keys are the unique values of the specified property from the objects, and the values are the objects themselves.
 *
 * @throws {Error} throw an error if a duplicate key value is found in the input array.
 *
 * @example
 * ```typescript
 * const users = [
 *   { id: 'a1', name: 'Alice' },
 *   { id: 'b2', name: 'Bob' }
 * ]
 * const groupedById = groupByUnique(users, 'id');
 * // Returns:{
 * //   'a1': { id: 'a1', name: 'Alice' },
 * //   'b2': { id: 'b2', name: 'Bob' }
 * // }
 * ```
 */

export function groupByUnique<
  T extends object,
  K extends KeysMatching<T, RecordKeyType | null | undefined>,
>(array: T[], selector: K): Record<RecordKeyType, T> {
  return array.reduce(
    (acc, item) => {
      const key = item[selector] as RecordKeyType | null | undefined
      if (key === undefined || key === null) {
        return acc
      }
      if (acc[key] !== undefined) {
        throw new Error(
          `Duplicated item for selector ${selector.toString()} with value ${key.toString()}`,
        )
      }
      acc[key] = item
      return acc
    },
    {} as Record<RecordKeyType, T>,
  )
}
