/**
 * Returns true if the two arrays are equal, false otherwise.
 * The arrays are considered equal if they have the same length, same order and the elements at each index are equal.
 */
export function areStringArraysEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index])
}