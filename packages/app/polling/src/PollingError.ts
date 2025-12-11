import { InternalError } from '@lokalise/node-core'

export const PollingFailureCause = {
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  INVALID_CONFIG: 'INVALID_CONFIG',
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
}
