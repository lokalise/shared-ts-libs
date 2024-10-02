import type { NonObject } from '../types.js'

// TODO: add doc
export const sort = <T extends NonObject>(array: T[], order: 'asc' | 'desc' = 'asc'): T[] =>
  order === 'asc'
    ? // @ts-expect-error
      array.sort((a, b) => a.localeCompare(b))
    : // @ts-expect-error
      array.sort((a, b) => b.localeCompare(a))
