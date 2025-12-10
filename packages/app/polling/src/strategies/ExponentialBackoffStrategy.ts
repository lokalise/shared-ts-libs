import { setTimeout } from 'node:timers/promises'
import type { RequestContext } from '@lokalise/fastify-extras'
import type { PollResult } from '../Poller.ts'
import { PollingError } from '../PollingError.ts'
import type { PollingStrategy } from './PollingStrategy.ts'

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
      throw new Error('initialDelayMs must be a non-negative finite number')
    }
    if (!Number.isFinite(config.maxDelayMs) || config.maxDelayMs < 0) {
      throw new Error('maxDelayMs must be a non-negative finite number')
    }
    if (config.initialDelayMs > config.maxDelayMs) {
      throw new Error('initialDelayMs must not exceed maxDelayMs')
    }
    if (!Number.isFinite(config.backoffMultiplier) || config.backoffMultiplier <= 0) {
      throw new Error('backoffMultiplier must be a positive finite number')
    }
    if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) {
      throw new Error('maxAttempts must be a positive integer')
    }
    if (config.jitterFactor !== undefined) {
      if (
        !Number.isFinite(config.jitterFactor) ||
        config.jitterFactor < 0 ||
        config.jitterFactor > 1
      ) {
        throw new Error('jitterFactor must be a finite number between 0 and 1')
      }
    }
  }

  async execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
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

    throw PollingError.timeout(this.config.maxAttempts, metadata)
  }

  private checkAborted(
    signal: AbortSignal | undefined,
    attemptsMade: number,
    metadata?: Record<string, unknown>,
  ): void {
    if (signal?.aborted) {
      throw PollingError.cancelled(attemptsMade, metadata)
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
      await setTimeout(delayMs, undefined, { signal })
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw PollingError.cancelled(attempt, metadata)
      }
      throw error instanceof Error ? error : new Error(String(error))
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
