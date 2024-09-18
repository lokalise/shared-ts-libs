/**
 * Check if two arrays are equal.
 * The arrays are considered equal if they have the same length, same order and the elements at each index by value are equal.
 * Note: Equality is compared by value and not by reference.
 */
export function areArraysEqual(a: unknown[], b: unknown[]): boolean {
  // Early return if we are comparing the same array
  if (a === b) return true
  if (a.length !== b.length) return false

  return a.every((value, index) => areEquals(value, b[index]))
}

const areEquals = (item1: unknown, item2: unknown): boolean => {
  if (item1 === item2) return true

  // both should be defined at this point
  // if both are nullable but with different values (null, undefined) they are not equal
  if (!item1 || !item2) return false

  // if both are arrays, compare them recursively
  if (Array.isArray(item1) && Array.isArray(item2)) return areArraysEqual(item1, item2)

  // if both are objects, compare them recursively
  if (typeof item1 === 'object' && typeof item2 === 'object') {
    return Object.keys(item1).every((k) => {
      if (!Object.hasOwn(item2, k)) return false
      // @ts-ignore
      return areEquals(item1[k], item2[k])
    })
  }

  return false
}
