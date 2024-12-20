import type { RecordKeyType } from '../../internal/types.js'

/**
 * Checks if an object or an array of objects is empty.
 *
 * For an object, it is considered empty if it has no own enumerable properties with non-undefined values.
 * For an array, it is considered empty if all objects within it are empty by the same criteria.
 *
 * @param {Record| Record[]} obj - The object or array of objects to evaluate.
 * @returns {boolean} Returns `true` if the object or every object within the array is empty, `false` otherwise.
 *
 * @example
 * ```typescript
 * const emptyObject = {}
 * const isEmptyObj = isEmpty(emptyObject) // true
 * ```
 */
export const isEmpty = (
  obj: Record<RecordKeyType, unknown> | Record<RecordKeyType, unknown>[],
): boolean => {
  if (Array.isArray(obj)) return obj.every(isEmpty)

  for (const key in obj) {
    if (Object.hasOwn(obj, key) && obj[key] !== undefined) return false
  }

  return true
}
