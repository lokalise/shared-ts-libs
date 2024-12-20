import type { RecordKeyType } from '../../internal/types.js'

export type PickOptions = {
  keepUndefined?: boolean
  keepNull?: boolean
}

// Type utility to filter out keys based on type `T` and PickOptions `O`
type FilteredKeys<T, K extends keyof T, O extends PickOptions> = {
  [P in K]: (O['keepUndefined'] extends false ? (undefined extends T[P] ? never : P) : P) &
    (O['keepNull'] extends false ? (null extends T[P] ? never : P) : P)
}[K]

// Main type to conditionally pick properties based on options
type PickOutput<T, K extends keyof T, O extends PickOptions> = Pick<T, FilteredKeys<T, K, O>>

/**
 * Picks specified properties from an object and returns a new object with those properties.
 *
 * This function allows you to create a subset of an object by specifying which properties
 * should be picked. You can also control whether properties with `undefined` or `null`
 * values should be included in the result through the options parameter.
 *
 * @template T - The type of the source object.
 * @template K - The type of the keys to be picked from the source object.
 *
 * @param {T} source - The source object to pick properties from.
 * @param {K[]} propNames - An array of property names to be picked from the source object.
 * @param {PickOptions} [options] - Optional settings to control whether `undefined` or `null`
 *  values are kept in the result:
 *    - `keepUndefined`: If false, properties with `undefined` values are skipped. Defaults to true.
 *    - `keepNull`: If false, properties with `null` values are skipped. Defaults to true.
 *
 * @return An object containing the picked properties.
 *
 * @example
 * ```typescript
 * const source = { a: 1, b: '2' }
 * const result = pick(source, ['a']) // Returns: { a: 1 }
 * ```
 */
export const pick = <
  T extends Record<RecordKeyType, unknown>,
  K extends keyof T,
  O extends PickOptions = { keepUndefined: true; keepNull: true },
>(
  source: T,
  propNames: readonly K[],
  options?: O,
): PickOutput<T, K, O> => {
  const result = {} as T

  for (const prop of propNames) {
    if (shouldBePicked(source, prop, options)) result[prop] = source[prop]
  }

  return result
}

const shouldBePicked = <T extends Record<RecordKeyType, unknown>, K extends keyof T>(
  source: T,
  propName: K,
  options?: PickOptions,
): boolean => {
  if (!(propName in source)) return false

  const sourceValue = source[propName]

  if (sourceValue === undefined && options?.keepUndefined === false) return false
  if (sourceValue === null && options?.keepNull === false) return false

  return true
}
