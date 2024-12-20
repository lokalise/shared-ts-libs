import { isObject } from './isObject.js'

export type StandardizedError = {
  code: string
  message: string
}

/**
 * Type guard to determine if a given value is a `StandardizedError` object.
 *
 * This function checks whether the provided input conforms to the `StandardizedError` structure, which is commonly
 * used in libraries (e.g., Fastify). Specifically, it verifies that the input is an object containing `code` and
 * `message` properties, both of type `string`.
 *
 * @param {unknown} error - The value to be checked for being a `StandardizedError`.
 * @returns {error is StandardizedError} Returns `true` if the input is a `StandardizedError` object; otherwise, returns `false`.
 *
 * @example
 * ```typescript
 * const a = isStandardizedError({ code: 'code', message: 'test' }) // True
 * const b = isStandardizedError({ hello: 'world' }) // False
 * ```
 */
export const isStandardizedError = (error: unknown): error is StandardizedError =>
  isObject(error) && typeof error.code === 'string' && typeof error.message === 'string'
