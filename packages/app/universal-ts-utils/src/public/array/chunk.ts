/**
 * Divides the original array into smaller arrays of the given `chunkSize`.
 *
 * @template T - The type of elements in the input array.
 * @param {T[]} array - The array to be divided into chunks.
 * @param {number} chunkSize - The size of each chunk.
 * @returns {T[][]} - A new array containing chunks of the original array.
 *
 * @example
 * ```typescript
 * const numbers = [1, 2, 3, 4, 5]
 * const result = chunk(numbers, 2) // returns [[1, 2], [3, 4], [5]]
 * ```
 */
export const chunk = <T>(array: T[], chunkSize: number): T[][] => {
  const length = array.length
  if (!length || chunkSize < 1) {
    return []
  }
  let index = 0
  let resIndex = 0
  const result = new Array(Math.ceil(length / chunkSize))

  while (index < length) {
    // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
    result[resIndex++] = array.slice(index, (index += chunkSize))
  }

  return result
}
