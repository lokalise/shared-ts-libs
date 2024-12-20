import type { RecordKeyType } from '../../internal/types.js'

type Output<T extends Record<RecordKeyType, unknown>> = Pick<
  T,
  {
    [Prop in keyof T]: T[Prop] extends null | undefined ? never : Prop
  }[keyof T]
>

/**
 * Creates a shallow copy of an object, excluding properties with nullish values.
 *
 * @template T - The type of the source object.
 * @param {T} object - The source object from which to copy properties.
 * @returns {Output<T>} A new object containing only the non-nullish properties from the source object.
 *
 * @example
 * ```typescript
 * const source = {
 *   name: 'Alice',
 *   age: null,
 *   occupation: 'Explorer',
 *   location: undefined,
 *   status: 'Active'
 * }
 * const result = copyWithoutNullish(source) // Returns: { name: 'Alice', occupation: 'Explorer', status: 'Active' }
 * ```
 */
export const copyWithoutNullish = <T extends Record<RecordKeyType, unknown>>(
  object: T,
): Output<T> =>
  Object.keys(object).reduce(
    (acc, key) => {
      const value = object[key]
      if (value === undefined || value === null) return acc

      // TODO: handle nested objects
      acc[key] = object[key]
      return acc
    },
    {} as Record<RecordKeyType, unknown>,
  ) as Output<T>
