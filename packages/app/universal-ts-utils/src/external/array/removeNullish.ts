/**
 * Return a copy of the given array without null or undefined values
 */
export function removeNullish<const T>(array: readonly (T | null | undefined)[]): T[] {
  return array.filter((e) => e !== undefined && e !== null) as T[]
}
