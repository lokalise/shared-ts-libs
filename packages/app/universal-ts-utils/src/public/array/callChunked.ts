/**
 * Processes an array in chunks asynchronously.
 *
 * @template Item - The type of items in the array.
 *
 * @param {number} chunkSize - The size of each chunk that the array should be processed in.
 * @param {readonly Item[]} array - The array of items to be processed.
 * @param {(arrayChunk: Item[]) => Promise<void> | void} processFn - The asynchronous function to be called with each
 *                                                                  chunk of the array.
 *
 * @returns {Promise<void>} - A promise that resolves when all chunks have been processed.
 *
 * @example
 * ```typescript
 * const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
 *
 * async function processChunk(chunk: number[]): Promise<void> {
 *   console.log('Processing chunk', chunk);
 * }
 *
 * callChunked(3, items, processChunk)
 *   .then(() => {
 *     console.log('All chunks processed');
 *   })
 *   .catch((error) => {
 *     console.error('Error processing chunks:', error);
 *   });
 * ```
 */
export const callChunked = async <Item>(
  chunkSize: number,
  array: readonly Item[],
  processFn: (arrayChunk: Item[]) => Promise<void> | void,
): Promise<void> => {
  for (let i = 0; i < array.length; i += chunkSize) {
    const arrayChunk = array.slice(i, i + chunkSize)
    await processFn(arrayChunk)
  }
}
