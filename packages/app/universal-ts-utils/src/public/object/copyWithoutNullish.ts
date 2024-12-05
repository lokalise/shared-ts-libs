import type { RecordKeyType } from '../../internal/types.js'

type Output<T extends Record<RecordKeyType, unknown>> = Pick<
  T,
  {
    [Prop in keyof T]: T[Prop] extends null | undefined ? never : Prop
  }[keyof T]
>

/**
 * Creates a shallow copy of an object, excluding properties with `null` or `undefined` values.
 *
 * This function iterates over an object's own enumerable properties and creates a new
 * object that excludes properties with `null` or `undefined` values.
 *
 * @param {Record} object - The source object from which to copy properties.
 * @returns {Record} A new object containing only the properties from the source object
 *    that do not have `null` or `undefined` values.
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
