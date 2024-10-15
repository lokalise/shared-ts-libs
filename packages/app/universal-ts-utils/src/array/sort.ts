/**
 * Sorts an array of strings or numbers in either ascending or descending order.
 *
 * @template T The type of the elements in the array.
 * @param {T[]} array - The array to be sorted. This should be an array of string or numeric values.
 * @param {'asc' | 'desc'} [order='asc'] - The order in which to sort the array. Defaults to 'asc' if not specified.
 *
 * @returns {T[]} A new array sorted in the specified order. The original array remains unmodified.
 *
 * @remarks This function returns a copy of the original array that is sorted according to the specified order.
 * It does not modify the input array, making it safe to use without side effects.
 */
export const sort = <T extends string[] | number[]>(array: T, order: 'asc' | 'desc' = 'asc'): T => {
  if (array.length < 2) return array

  const copy = [...array]
  return (
    order === 'asc' ? copy.sort((a, b) => compare(a, b)) : copy.sort((a, b) => compare(b, a))
  ) as T
}

const compare = <T extends string | number>(a: T, b: T): number => {
  let result = 0
  if (typeof a === 'string' && typeof b === 'string') {
    // Sort strings using localeCompare
    result = a.localeCompare(b)
  } else if (typeof a === 'number' && typeof b === 'number') {
    // Sort numbers using basic comparison
    result = a - b
  }

  return result
}
