export type PickOptions = {
  keepUndefined?: boolean
  keepNull?: boolean
}

/**
 * Picks specified properties from an object and returns a new object with those properties.
 *
 * This function allows you to create a subset of an object by specifying which properties
 * should be picked. You can also control whether properties with `undefined` or `null`
 * values should be included in the result through the options parameter.
 *
 * @param {T} source - The source object to pick properties from.
 * @param {K[]} propNames - An array of property names to be picked from the source object.
 * @param {PickOptions} [options] - Optional settings to control whether `undefined` or `null`
 *  values are kept in the result:
 *    - `keepUndefined`: If false, properties with `undefined` values are skipped. Defaults to true.
 *    - `keepNull`: If false, properties with `null` values are skipped. Defaults to true.
 *
 * @return An object containing the picked properties.
 */
export const pick = <T, K extends string | number | symbol>(
  source: T,
  propNames: readonly K[],
  options?: PickOptions,
): Pick<T, Exclude<keyof T, Exclude<keyof T, K>>> => {
  const result = {} as T

  for (const prop of propNames) {
    // @ts-expect-error
    if (shouldBePicked(source, prop, options)) result[prop] = source[prop]
  }

  return result
}

const shouldBePicked = <T, K extends string | number | symbol>(
  source: T,
  propName: K,
  options?: PickOptions,
): boolean => {
  // @ts-expect-error
  if (!(propName in source)) return false

  // @ts-expect-error
  const sourceValue = source[propName]

  if (sourceValue === undefined && options?.keepUndefined === false) return false
  if (sourceValue === null && options?.keepNull === false) return false

  return true
}
