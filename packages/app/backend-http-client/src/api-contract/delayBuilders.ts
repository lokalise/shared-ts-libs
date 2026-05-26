import type { RetryDelay } from './retry.ts'

export type ConstantDelayOptions = {
  /** Fixed delay in milliseconds returned for every retry attempt. */
  baseDelayMs: number
}

/** Returns a delay function that always returns the same fixed delay, regardless of the retry attempt number. */
export const constantDelay =
  ({ baseDelayMs }: ConstantDelayOptions): RetryDelay =>
  (_attemptsMade) =>
    baseDelayMs

export type LinearDelayOptions = {
  /** Base delay in milliseconds. The delay grows as `attempt * baseDelayMs`. */
  baseDelayMs: number
}

/** Returns a delay function that grows linearly with the retry attempt number: `attempt * baseDelayMs`. */
export const linearDelay =
  ({ baseDelayMs }: LinearDelayOptions): RetryDelay =>
  (attemptsMade) =>
    attemptsMade * baseDelayMs

export type ExponentialDelayOptions = {
  /** Base delay in milliseconds. The delay grows as `baseDelayMs * multiplier^(attempt - 1)`. */
  baseDelayMs: number
  /**
   * Growth rate of the backoff. Each retry multiplies the previous delay by this value.
   *
   * @default 2
   */
  multiplier?: number
}

/** Returns a delay function that grows exponentially with the retry attempt number: `baseDelayMs * multiplier^(attempt - 1)`. */
export const exponentialDelay =
  ({ baseDelayMs, multiplier = 2 }: ExponentialDelayOptions): RetryDelay =>
  (attemptsMade) =>
    baseDelayMs * multiplier ** (attemptsMade - 1)
