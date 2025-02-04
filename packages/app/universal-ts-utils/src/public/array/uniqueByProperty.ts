/**
 * Removes duplicates from an array of objects by a property and returns new array.
 *
 * @template T - The type of elements in the input array.
 * @param {T[]} array - The array from which to remove duplicate values.
 * @param {keyof T} key - key of the object from the input array.
 *
 * @example
 * ```typescript
 * const array = [
 *       { id: 'a', value: 1 },
 *       { id: 'b', value: 2 },
 *       { id: 'a', value: 3 },
 * ]
 * const result = uniqueByProperty(array) // Returns: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }]
 * ```
 */
export const uniqueByProperty = <T extends object>(array: T[], key: keyof T) => {
  const seen = new Set()
  return array.filter((item) => {
    const duplicate = seen.has(item[key])
    seen.add(item[key])
    return !duplicate
  })
}
