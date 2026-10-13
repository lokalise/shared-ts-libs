type Left<T> = {
  error: T
  result?: never
}

type Right<U> = {
  error?: never
  result: U
}

/**
 * A functional programming type used to communicate errors in potentially recoverable scenarios.
 * It holds either an error (Left side) or a resolved result (Right side), but not both.
 * It is up to the caller to handle the error, or to throw if it cannot.
 *
 * @template T - The type of the error.
 * @template U - The type of the result.
 *
 * @see {@link https://antman-does-software.com/stop-catching-errors-in-typescript-use-the-either-type-to-make-your-code-predictable Further reading on motivation for Either type}
 *
 * @example
 * ```typescript
 * const parsePort = (value: string): Either<'NOT_A_NUMBER', number> => {
 *   const port = Number(value)
 *   return Number.isNaN(port) ? failure('NOT_A_NUMBER') : success(port)
 * }
 *
 * const port = parsePort('8080')
 * if (isFailure(port)) console.error(port.error)
 * else console.log(port.result)
 * ```
 */
export type Either<T, U> = NonNullable<Left<T> | Right<U>>

/**
 * A variation of `Either` that always has a result and may also have an error.
 *
 * @template T - The type of the error.
 * @template U - The type of the result.
 */
export type DefiniteEither<T, U> = {
  error?: T
  result: U
}

/**
 * Checks whether an `Either` holds an error, narrowing it to the Left side.
 *
 * @param {Either<T, U>} e - The `Either` to check.
 * @returns {boolean} `true` if `e.error` is set, `false` otherwise.
 */
export const isFailure = <T, U>(e: Either<T, U>): e is Left<T> => e.error !== undefined

/**
 * Checks whether an `Either` holds a result, narrowing it to the Right side.
 *
 * @param {Either<T, U>} e - The `Either` to check.
 * @returns {boolean} `true` if `e.result` is set, `false` otherwise.
 */
export const isSuccess = <T, U>(e: Either<T, U>): e is Right<U> => e.result !== undefined

/**
 * Creates the Left side of an `Either`, holding an error.
 *
 * @param {T} error - The error to hold.
 * @returns {Left<T>} An object with the `error` property set.
 */
export const failure = <const T>(error: T): Left<T> => ({ error })

/**
 * Creates the Right side of an `Either`, holding a result.
 *
 * @param {U} result - The result to hold.
 * @returns {Right<U>} An object with the `result` property set.
 */
export const success = <const U>(result: U): Right<U> => ({ result })
