/**
 * Determines if two unknown values are deeply equal. This function handles primitive types,
 * arrays, and objects. For arrays and objects, it performs a recursive equality check.
 *
 * @param {unknown} a - The first value to compare. Can be of any type including array and object.
 * @param {unknown} b - The second value to compare. Should be of the same type or comparable with `a`.
 * @returns {boolean} Returns `true` if the two values are deeply equal, `false` otherwise.
 *
 * @example
 * ```typescript
 * areEquals(1, 1) // true
 * areEquals([1, 2], [1, 2]) // true
 * areEquals({ name: 'John' }, { name: 'John' }) // true
 * areEquals(null, null) // true
 * areEquals(undefined, null) // false
 * areEquals([1, [2, 3]], [1, [2, 3]]) // true
 * areEquals([{ id: 1 }], [{ id: 1 }]) // true
 * ```
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
