import type { KeysMatching, RecordKeyType } from '../../internal/types.js'

/**
 * @param array The array of objects to be grouped.
 * @param selector The key used for grouping the objects.
 * @returns An object where the keys are unique values from the given selector and the value is the
 *  corresponding object from the array.
 * @throws InternalError If a duplicated value is found for the given selector.
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
