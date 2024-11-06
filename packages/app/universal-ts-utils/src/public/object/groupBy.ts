import type { KeysMatching, RecordKeyType } from '../../internal/types'

/**
 * @param array The array of objects to be grouped.
 * @param selector The key used for grouping the objects.
 * @returns An object where the keys are unique values from the given selector and the values are the corresponding objects from the array.
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
