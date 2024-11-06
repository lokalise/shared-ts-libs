/**
 * A method to remove duplicates from an array of primitive values.
 * Value equality is based on the SameValueZero algorithm.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set#value_equality
 */
export const unique = <T>(arr: T[]): T[] => Array.from(new Set(arr))
