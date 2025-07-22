export const assertIsNever = (value: never): never => {
  throw new Error(`Unexpected value: ${value}`)
}
