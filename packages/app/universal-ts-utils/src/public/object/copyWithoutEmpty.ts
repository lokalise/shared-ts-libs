import type { RecordKeyType } from '../../internal/types.ts'

type Output<T extends Record<RecordKeyType, unknown>> = Pick<
  T,
  {
    [Prop in keyof T]: T[Prop] extends null | undefined | '' ? never : Prop
  }[keyof T]
>

/**
 * Creates a shallow copy of an object, excluding properties with "empty" values.
 * An "empty" value includes `null`, `undefined`, and empty strings (`''`).
 *
 * @template T - The type of the source object.
 * @param {T} object - The source object from which to copy properties.
 * @returns {Output<T>} A new object containing only the non-empty properties from the source object.
 *
 * @example
 * ```typescript
 * const source = {
 *   name: 'Alice',
 *   age: null,
 *   occupation: '',
 *   location: 'Wonderland',
 *   status: undefined
 * }
 * const result = copyWithoutEmpty(source); // Returns: { name: 'Alice', location: 'Wonderland' }
 * ```
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
