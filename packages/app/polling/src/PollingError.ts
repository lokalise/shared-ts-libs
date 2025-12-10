import { InternalError } from '@lokalise/node-core'

export const PollingFailureCause = {
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
} as const

export type PollingFailureCause = (typeof PollingFailureCause)[keyof typeof PollingFailureCause]

export class PollingError extends InternalError {
  readonly failureCause: PollingFailureCause
  readonly attemptsMade: number

  constructor(
    message: string,
    failureCause: PollingFailureCause,
    attemptsMade: number,
    details?: Record<string, unknown>,
    originalError?: Error,
  ) {
    super({
      message,
      details: {
        failureCause,
        attemptsMade,
        ...details,
      },
      errorCode: `POLLING_${failureCause}`,
    })
    this.name = 'PollingError'
    this.failureCause = failureCause
    this.attemptsMade = attemptsMade

    if (originalError) {
      this.cause = originalError
    }
  }

  static timeout(maxAttempts: number, metadata?: Record<string, unknown>): PollingError {
    return new PollingError(
      `Polling timeout after ${maxAttempts} attempts`,
      PollingFailureCause.TIMEOUT,
      maxAttempts,
      metadata,
    )
  }

  static cancelled(attemptsMade: number, metadata?: Record<string, unknown>): PollingError {
    return new PollingError(
      `Polling cancelled after ${attemptsMade} attempts`,
      PollingFailureCause.CANCELLED,
      attemptsMade,
      metadata,
    )
  }
}
