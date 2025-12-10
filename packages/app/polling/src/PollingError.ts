export const PollingFailureCause = {
  TIMEOUT: 'TIMEOUT',
} as const

export type PollingFailureCause = (typeof PollingFailureCause)[keyof typeof PollingFailureCause]

export class PollingError extends Error {
  readonly failureCause: PollingFailureCause
  readonly attemptsMade: number

  constructor(
    message: string,
    failureCause: PollingFailureCause,
    attemptsMade: number,
    originalError?: Error,
  ) {
    super(message, { cause: originalError })
    this.name = 'PollingError'
    this.failureCause = failureCause
    this.attemptsMade = attemptsMade
  }

  static timeout(maxAttempts: number, metadata?: Record<string, unknown>): PollingError {
    const metadataStr = metadata ? ` [${JSON.stringify(metadata)}]` : ''
    return new PollingError(
      `Polling timeout after ${maxAttempts} attempts${metadataStr}`,
      PollingFailureCause.TIMEOUT,
      maxAttempts,
    )
  }
}
