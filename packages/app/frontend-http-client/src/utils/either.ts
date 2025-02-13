type Left<T> = {
  error: T
  result?: never
}

type Right<U> = {
  error?: never
  result: U
}

/**
 * Either is a functional programming type which is used to communicate errors happening in potentially recoverable scenarios.
 * It can return either an error (Left side) or a resolved result (Right side), but not both.
 * It is up to caller of the function to handle received error or throw (Public)NonRecoverableError if it cannot.
 *
 * @see {@link https://antman-does-software.com/stop-catching-errors-in-typescript-use-the-either-type-to-make-your-code-predictable Further reading on motivation for Either type}
 */
export type Either<T, U> = NonNullable<Left<T> | Right<U>>

/***
 * Variation of Either, which may or may not have Error set, but always has Result
 */
export type DefiniteEither<T, U> = {
  error?: T
  result: U
}

export const isFailure = <T, U>(e: Either<T, U>): e is Left<T> => {
  return e.error !== undefined
}

export const isSuccess = <T, U>(e: Either<T, U>): e is Right<U> => {
  return e.result !== undefined
}

export const failure = <T>(error: T): Left<T> => ({ error })

export const success = <U>(result: U): Right<U> => ({ result })
