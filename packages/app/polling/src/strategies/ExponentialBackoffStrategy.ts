import type { PollingOptions, PollingStrategy, PollResult, RequestContext } from '../Poller.ts'
import { PollingError, PollingFailureCause } from '../PollingError.ts'
import { delay } from '../utils/delay.ts'

/**
 * Configuration for exponential backoff polling strategy.
 *
 * Delays are calculated as: min(initialDelayMs × backoffMultiplier^(attempt-1), maxDelayMs)
 * with optional jitter applied to prevent request clustering.
 */
export interface ExponentialBackoffConfig {
  /** Starting delay in milliseconds (must be >= 0). First poll happens immediately. */
  initialDelayMs: number
  /** Maximum delay cap in milliseconds (must be >= initialDelayMs). */
  maxDelayMs: number
  /** Exponential growth factor (must be > 0). Use 1 for fixed intervals. */
  backoffMultiplier: number
  /** Maximum number of polling attempts (must be >= 1). */
  maxAttempts: number
  /** Randomization factor 0-1 (default: 0.2). Adds ±(delay × jitterFactor × 0.5) randomness. Set to 0 to disable jitter. */
  jitterFactor?: number
}

// Standard polling for typical async operations (max ~4.5 min)
export const STANDARD_EXPONENTIAL_BACKOFF_CONFIG: ExponentialBackoffConfig = {
  initialDelayMs: 2000,
  maxDelayMs: 15000,
  backoffMultiplier: 1.5,
  maxAttempts: 20,
  jitterFactor: 0.2,
}

export class ExponentialBackoffStrategy implements PollingStrategy {
  private readonly config: ExponentialBackoffConfig

  constructor(config: ExponentialBackoffConfig) {
    this.validateConfig(config)
    this.config = config
  }

  private validateConfig(config: ExponentialBackoffConfig): void {
    if (!Number.isFinite(config.initialDelayMs) || config.initialDelayMs < 0) {
      throw new PollingError(
        'initialDelayMs must be a non-negative finite number',
        PollingFailureCause.INVALID_CONFIG,
        0,
      )
    }
    if (!Number.isFinite(config.maxDelayMs) || config.maxDelayMs < 0) {
      throw new PollingError(
        'maxDelayMs must be a non-negative finite number',
        PollingFailureCause.INVALID_CONFIG,
        0,
      )
    }
    if (config.initialDelayMs > config.maxDelayMs) {
      throw new PollingError(
        'initialDelayMs must not exceed maxDelayMs',
        PollingFailureCause.INVALID_CONFIG,
        0,
      )
    }
    if (!Number.isFinite(config.backoffMultiplier) || config.backoffMultiplier <= 0) {
      throw new PollingError(
        'backoffMultiplier must be a positive finite number',
        PollingFailureCause.INVALID_CONFIG,
        0,
      )
    }
    if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) {
      throw new PollingError(
        'maxAttempts must be a positive integer',
        PollingFailureCause.INVALID_CONFIG,
        0,
      )
    }
    if (config.jitterFactor !== undefined) {
      if (
        !Number.isFinite(config.jitterFactor) ||
        config.jitterFactor < 0 ||
        config.jitterFactor > 1
      ) {
        throw new PollingError(
          'jitterFactor must be a finite number between 0 and 1',
          PollingFailureCause.INVALID_CONFIG,
          0,
        )
      }
    }
  }

  async execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options: PollingOptions,
  ): Promise<T> {
    const { reqContext, metadata, signal } = options

    this.checkAborted(signal, 0, metadata)

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      this.checkAborted(signal, attempt - 1, metadata)

      const result = await pollFn(attempt)

      if (result.isComplete) {
        this.logSuccess(reqContext, attempt, metadata)
        return result.value
      }

      if (attempt < this.config.maxAttempts) {
        await this.waitBeforeRetry(attempt, reqContext, metadata, signal)
      }
    }

    throw new PollingError(
      `Polling timeout after ${this.config.maxAttempts} attempts`,
      PollingFailureCause.TIMEOUT,
      this.config.maxAttempts,
      metadata,
    )
  }

  private checkAborted(
    signal: AbortSignal | undefined,
    attemptsMade: number,
    metadata?: Record<string, unknown>,
  ): void {
    if (signal?.aborted) {
      throw new PollingError(
        `Polling cancelled after ${attemptsMade} attempts`,
        PollingFailureCause.CANCELLED,
        attemptsMade,
        metadata,
      )
    }
  }

  private logSuccess(
    reqContext: RequestContext,
    attempt: number,
    metadata?: Record<string, unknown>,
  ): void {
    reqContext.logger.debug(
      { attempt, totalAttempts: this.config.maxAttempts, ...metadata },
      'Polling completed successfully',
    )
  }

  private async waitBeforeRetry(
    attempt: number,
    reqContext: RequestContext,
    metadata: Record<string, unknown> | undefined,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const delayMs = this.calculateDelay(attempt - 1)
    reqContext.logger.debug(
      { attempt, nextDelayMs: delayMs, ...metadata },
      'Polling not complete, waiting before retry',
    )

    try {
      await delay(delayMs, signal)
    } catch {
      // delay with signal only throws when the signal is aborted
      throw new PollingError(
        `Polling cancelled after ${attempt} attempts`,
        PollingFailureCause.CANCELLED,
        attempt,
        metadata,
      )
    }
  }

  private calculateDelay(attemptIndex: number): number {
    const baseDelay = Math.min(
      this.config.initialDelayMs * this.config.backoffMultiplier ** attemptIndex,
      this.config.maxDelayMs,
    )

    const jitterFactor = this.config.jitterFactor ?? 0.2
    const jitter = baseDelay * jitterFactor * (Math.random() - 0.5)

    // Ensure delay is always positive and respects maxDelayMs
    return Math.min(this.config.maxDelayMs, Math.max(0, Math.round(baseDelay + jitter)))
  }
}
