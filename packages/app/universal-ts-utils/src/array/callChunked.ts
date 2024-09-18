
export async function callChunked<Item>(
  chunkSize: number,
  array: readonly Item[],
  processFn: (arrayChunk: Item[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < array.length; i += chunkSize) {
    const arrayChunk = array.slice(i, i + chunkSize)
    await processFn(arrayChunk)
  }
}
