import type { RecordKeyType } from '../../internal/types.js'

type Output<T extends Record<RecordKeyType, unknown>> = Pick<
  T,
  {
    [Prop in keyof T]: T[Prop] extends null | undefined | '' ? never : Prop
  }[keyof T]
>

/**
 * Creates a shallow copy of an object, excluding properties with "empty" values.
 *
 * A "empty" value includes `null`, `undefined`, empty strings (`''`).
 *
 * @param {Record} object - The source object from which to copy properties.
 * @returns {Record} A new object containing only the properties from the source object
 *    that do not have "falsy" values.
 */
export const copyWithoutEmpty = <T extends Record<RecordKeyType, unknown>>(object: T): Output<T> =>
  Object.keys(object).reduce(
    (acc, key) => {
      const value = object[key] as unknown
      if (value === undefined) return acc
      if (value === null) return acc
      if (typeof value === 'string' && value.trim().length === 0) return acc

      // TODO: handle nested objects
      acc[key] = object[key]
      return acc
    },
    {} as Record<RecordKeyType, unknown>,
  ) as Output<T>
