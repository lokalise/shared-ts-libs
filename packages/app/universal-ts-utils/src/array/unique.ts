/**
 * A method to remove duplicates from an array of primitive values.
 * Elements are compared by reference using a Set.
 */
export const unique = <T>(arr: T[]): T[] => Array.from(new Set(arr))
