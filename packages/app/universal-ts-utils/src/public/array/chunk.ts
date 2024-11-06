export function chunk<T>(array: T[], chunkSize: number): T[][] {
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
