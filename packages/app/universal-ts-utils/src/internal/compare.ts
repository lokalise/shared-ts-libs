export const compare = <T extends string | number>(a: T, b: T): number => {
  let result = 0
  if (typeof a === 'string' && typeof b === 'string') {
    // Sort strings using localeCompare
    result = a.localeCompare(b)
  } else if (typeof a === 'number' && typeof b === 'number') {
    // Sort numbers using basic comparison
    result = a - b
  }

  return result
}
