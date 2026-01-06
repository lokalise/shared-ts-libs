export const PollingFailureCause = {
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  INVALID_CONFIG: 'INVALID_CONFIG',
} as const

export type PollingFailureCause = (typeof PollingFailureCause)[keyof typeof PollingFailureCause]

/**
 * Error class for all polling-related failures.
 * Provides structured error information with discriminated union support.
 *
 * @example
 * ```typescript
 * try {
 *   await poller.poll(pollFn, options)
 * } catch (error) {
 *   if (PollingError.isPollingError(error)) {
 *     console.log('Polling failed:', error.failureCause)
 *   }
 * }
 * ```
 */
export class PollingError extends Error {
  /** Structured error code for programmatic error handling */
  readonly errorCode: string

  /** Additional structured context and metadata */
  readonly details: Record<string, unknown>

  /** Type of polling failure */
  readonly failureCause: PollingFailureCause

  /** Number of attempts made before failure */
  readonly attemptsMade: number

  constructor(
    message: string,
    failureCause: PollingFailureCause,
    attemptsMade: number,
    details?: Record<string, unknown>,
    originalError?: Error,
  ) {
    super(message)
    this.name = 'PollingError'
    this.errorCode = `POLLING_${failureCause}`
    this.failureCause = failureCause
    this.attemptsMade = attemptsMade
    this.details = {
      failureCause,
      attemptsMade,
      ...details,
    }

    if (originalError) {
      this.cause = originalError
    }

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Type guard to check if an unknown error is a PollingError.
   * Recommended over `instanceof` for better compatibility across realms and contexts.
   *
   * @param error - The error to check
   * @returns true if the error is a PollingError
   *
   * @example
   * ```typescript
   * try {
   *   await poller.poll(pollFn, options)
   * } catch (error) {
   *   if (PollingError.isPollingError(error)) {
   *     // TypeScript knows error is PollingError here
   *     console.log(error.failureCause)
   *   }
   * }
   * ```
   */
  static isPollingError(error: unknown): error is PollingError {
    if (error instanceof PollingError) {
      return true
    }

    if (typeof error !== 'object' || error === null) {
      return false
    }

    const err = error as Record<string, unknown>

    // Validate failureCause is one of the valid enum values
    const validFailureCauses: string[] = Object.values(PollingFailureCause)
    const isValidFailureCause =
      typeof err.failureCause === 'string' && validFailureCauses.includes(err.failureCause)

    return (
      err.name === 'PollingError' &&
      isValidFailureCause &&
      typeof err.attemptsMade === 'number' &&
      typeof err.errorCode === 'string' &&
      typeof err.details === 'object' &&
      err.details !== null
    )
  }
}
