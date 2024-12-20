/**
 * Type guard to determine if a given value is a non-null object in TypeScript.
 *
 * @param {unknown} maybeObject - The value to be checked for being a non-null object.
 * @returns {maybeObject is Record<PropertyKey, unknown>} Returns `true` if the input is an object and not `null`; otherwise, returns `false`.
 *
 * @example
 * ```typescript
 * const a = isObject(obj) // True
 * const b = isObject('hello') // False
 * ```
 */
export const isObject = (maybeObject: unknown): maybeObject is Record<PropertyKey, unknown> =>
  typeof maybeObject === 'object' && maybeObject !== null
