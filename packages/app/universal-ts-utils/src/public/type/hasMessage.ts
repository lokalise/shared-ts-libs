import { isObject } from './isObject.js'

/**
 * Type guard to determine if a given value is an object with a string property `message`.
 *
 * @param {unknown} maybe - The value to be checked.
 * @returns {maybe is { message: string }} Returns `true` if the input is an object that has a `message` property of
 *  type `string`. Otherwise, returns `false`.
 *
 * @example
 * ```typescript
 * const a = hasMessage({ message: 'Hello, world!' }) // true
 * const b = hasMessage({ error: 'Hello, world!' }) // true
 * ```
 */
export const hasMessage = (maybe: unknown): maybe is { message: string } =>
  isObject(maybe) && typeof maybe.message === 'string'
