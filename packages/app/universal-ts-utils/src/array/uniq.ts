/**
 * A method to remove duplicates in an array of primitive values
 */
export const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr))
