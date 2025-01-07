/**
 * Type guard to determine if a given value is an `Error` object.
 *
 * @param {unknown} maybeError - The value to be checked for being an `Error` object.
 * @returns {maybeError is Error} Returns `true` if the input is an `Error` object; otherwise, returns `false`.
 *
 * @example
 * ```typescript
 * const a = new Error('I am an error') // False
 * const b = new Error(new Error()) // True
 * ```
 */
export const isError = (maybeError: unknown): maybeError is Error =>
  maybeError instanceof Error || Object.prototype.toString.call(maybeError) === '[object Error]'
