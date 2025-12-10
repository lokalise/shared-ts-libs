import { setTimeout } from 'node:timers/promises'
import type { RequestContext } from '@lokalise/fastify-extras'
import { PollingError } from './PollingError.ts'

export interface PollerConfig {
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  maxAttempts: number
  jitterFactor?: number
}

export type PollResult<T> = { isComplete: true; value: T } | { isComplete: false; value?: never }

// Standard polling for typical async operations (max ~4.5 min)
export const STANDARD_POLLER_CONFIG: PollerConfig = {
  initialDelayMs: 2000,
  maxDelayMs: 15000,
  backoffMultiplier: 1.5,
  maxAttempts: 20,
  jitterFactor: 0.2,
}

export class ExponentialBackoffPoller {
  /**
   * Polls until complete or timeout.
   *
   * @param pollFn - Function that returns PollResult. Should throw domain-specific
   *                 errors for terminal failure states.
   * @param config - Polling configuration (delays, max attempts, etc.)
   * @param reqContext - Request context for logging
   * @param metadata - Additional context for logging
   * @throws PollingError.timeout if max attempts exceeded
   * @throws Any domain-specific errors thrown by pollFn
   */
  async poll<T>(
    pollFn: () => Promise<PollResult<T>>,
    config: PollerConfig,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
      // Let domain errors bubble up naturally
      const result = await pollFn()

      if (result.isComplete) {
        reqContext.logger.debug(
          { attempt, totalAttempts: attempt + 1, ...metadata },
          'Polling completed successfully',
        )
        return result.value
      }

      // Only wait if there are more attempts remaining
      if (attempt < config.maxAttempts - 1) {
        const delayMs = this.calculateDelay(attempt, config)
        reqContext.logger.debug(
          { attempt: attempt + 1, nextDelayMs: delayMs, ...metadata },
          'Polling not complete, waiting before retry',
        )
        await setTimeout(delayMs)
      }
    }

    // Exceeded max attempts
    throw PollingError.timeout(config.maxAttempts, metadata)
  }

  private calculateDelay(attempt: number, config: PollerConfig): number {
    const baseDelay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
      config.maxDelayMs,
    )

    const jitterFactor = config.jitterFactor ?? 0.2
    const jitter = baseDelay * jitterFactor * (Math.random() - 0.5)

    return Math.round(baseDelay + jitter)
  }
}
