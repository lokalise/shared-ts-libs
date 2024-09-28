/**
 * TODO: Add doc
 */
export const areEquals = (a: unknown, b: unknown): boolean => {
  if (a === b) return true

  // both should be defined at this point
  // if both are nullable but with different values (null, undefined) they are not equal
  if (!a || !b) return false

  // if both are arrays, compare them recursively
  if (Array.isArray(a) && Array.isArray(b)) return areArraysEqual(a, b)

  // if both are objects, compare them recursively
  if (typeof a === 'object' && typeof b === 'object') {
    return Object.keys(a).every((k) => {
      if (!Object.hasOwn(b, k)) return false
      // @ts-ignore
      return areEquals(a[k], b[k])
    })
  }

  return false
}

const areArraysEqual = (a: unknown[], b: unknown[]): boolean => {
  if (a.length !== b.length) return false

  return a.every((value, index) => areEquals(value, b[index]))
}
