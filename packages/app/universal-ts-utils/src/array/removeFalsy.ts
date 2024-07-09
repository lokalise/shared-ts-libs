/**
 * Return a copy of the given array without falsy values (eg: false, 0, '', null, undefined)
 */
export function removeFalsy<const T>(
  array: readonly (T | null | undefined | 0 | '' | false)[],
): T[] {
  return array.filter((e) => e) as T[]
}
