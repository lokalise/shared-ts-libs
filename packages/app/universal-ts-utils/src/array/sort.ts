/**
 * Sorts an array of primitive types in either ascending or descending order.
 *
 * @template T The type of the elements in the array.
 *
 * @param {T[]} array - The array to be sorted. This should be an array of primitive values.
 * @param {'asc' | 'desc'} [order='asc'] - The order in which to sort the array. Defaults to 'asc' if not specified.
 *
 * @returns {T[]} The sorted array in the specified order.
 */
export const sort = <T extends string | number | boolean | symbol>(
  array: T[],
  order: 'asc' | 'desc' = 'asc',
): T[] =>
  order === 'asc' ? array.sort((a, b) => compare(a, b)) : array.sort((a, b) => compare(b, a))

export const compare = <T extends string | number | boolean | symbol>(a: T, b: T): number => {
  if (a === b) return 0

  // same types comparison
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b)
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)

  // number like comparison
  const [aNumeric, bNumeric] = [a, b].map((e) => Number(e))
  if (isNumericValue(aNumeric) && isNumericValue(bNumeric)) {
    // converted booleans has less priority than numbers or numeric strings
    if (typeof b === 'boolean') return 1
    if (typeof a === 'boolean') return -1

    return aNumeric - bNumeric
  }

  return String(a).localeCompare(String(b))
}

const isNumericValue = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value)
