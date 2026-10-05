import type { RecordKeyType } from '../../internal/types.ts'

type Output<T extends Record<RecordKeyType, unknown>> = Pick<
  T,
  {
    [Prop in keyof T]: T[Prop] extends undefined ? never : Prop
  }[keyof T]
>

/**
 * Creates a shallow copy of an object, excluding properties with `undefined` values.
 * Unlike `copyWithoutNullish`, properties with `null` values are kept.
 *
 * @template T - The type of the source object.
 * @param {T} object - The source object from which to copy properties.
 * @returns {Output<T>} A new object containing only the properties from the source object that are not `undefined`.
 *
 * @example
 * ```typescript
 * const source = {
 *   name: 'Alice',
 *   age: null,
 *   location: undefined,
 * }
 * const result = copyWithoutUndefined(source) // Returns: { name: 'Alice', age: null }
 * ```
 */
export const copyWithoutUndefined = <T extends Record<RecordKeyType, unknown>>(
  object: T,
): Output<T> =>
  Object.fromEntries(
    Reflect.ownKeys(object)
      .filter((key) => Object.prototype.propertyIsEnumerable.call(object, key))
      .filter((key) => object[key] !== undefined)
      .map((key) => [key, object[key]]),
  ) as Output<T>
