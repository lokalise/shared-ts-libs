type KeysMatching<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never
}[keyof T]

// TODO: add doc
export const sortByField = <T extends object, K extends KeysMatching<T, string | number | boolean>>(
  array: T[],
  field: K,
  order: 'asc' | 'desc' = 'asc',
): T[] =>
  order === 'asc'
    ? // @ts-expect-error
      array.sort((a, b) => a[field].localeCompare(b[field]))
    : // @ts-expect-error
      array.sort((a, b) => b[field].localeCompare(a[field]))
