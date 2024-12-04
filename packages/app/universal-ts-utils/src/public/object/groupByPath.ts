import type { RecordKeyType } from '../../internal/types.js'

/**
 * Groups an array of objects based on a specified key path.
 *
 * This function supports nested keys, allowing the use of dot notation
 * to group objects by deeply nested properties.
 *
 * @param {object[]} array - The array of objects to be grouped.
 * @param {string} selector - The key path used for grouping the objects. Supports nested keys using dot notation.
 * @returns {Record<RecordKeyType, object[]>} An object where each key represents a unique value from
 *    the given selector, and the corresponding value is an array of objects associated with that key.
 *
 * @example
 * ```typescript
 * const users = [
 *     { name: "A", address: { city: "New York" }, age: 30 },
 *     { name: "B", address: { city: "Los Angeles" }, age: 25 },
 *     { name: "C", address: { city: "New York" }, age: 35 },
 * ]
 * const usersGroupedByCity = groupByPath(users, 'address.city')
 *
 * console.log(usersGroupedByCity)
 * Output:
 * {
 *     "New York": [
 *         { name: "Alice", address: { city: "New York", zipCode: 10001 }, age: 30 },
 *         { name: "Charlie", address: { city: "New York", zipCode: 10001 }, age: 35 }
 *     ],
 *     "Los Angeles": [
 *         { name: "Bob", address: { city: "Los Angeles", zipCode: 90001 }, age: 25 }
 *     ]
 * }
 * ```
 */
export const groupByPath = <T extends object>(
  array: T[],
  selector: string,
): Record<RecordKeyType, T[]> => {
  return array.reduce(
    (acc, item) => {
      const key = getKeyBySelector(item, selector)
      if (key === undefined) return acc

      if (!acc[key]) acc[key] = []
      acc[key].push(item)

      return acc
    },
    {} as Record<RecordKeyType, T[]>,
  )
}

const getKeyBySelector = <T extends object>(
  item: T,
  selector: string,
): RecordKeyType | undefined => {
  const tree = selector.split('.')

  let result = item as unknown
  for (const treeProp of tree) {
    // @ts-expect-error
    if (treeProp in result) result = result[treeProp]
    else break
  }

  if (typeof result === 'string') return result
  if (typeof result === 'number') return result
  if (typeof result === 'symbol') return result

  return undefined
}
