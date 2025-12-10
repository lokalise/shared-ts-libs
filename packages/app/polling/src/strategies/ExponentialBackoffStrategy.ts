import { setTimeout } from 'node:timers/promises'
import type { RequestContext } from '@lokalise/fastify-extras'
import type { PollResult } from '../Poller.ts'
import { PollingError } from '../PollingError.ts'
import type { PollingStrategy } from './PollingStrategy.ts'

export interface ExponentialBackoffConfig {
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  maxAttempts: number
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
    this.config = config
  }

  async execute<T>(
    pollFn: () => Promise<PollResult<T>>,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
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
      if (attempt < this.config.maxAttempts - 1) {
        const delayMs = this.calculateDelay(attempt)
        reqContext.logger.debug(
          { attempt: attempt + 1, nextDelayMs: delayMs, ...metadata },
          'Polling not complete, waiting before retry',
        )
        await setTimeout(delayMs)
      }
    }

    // Exceeded max attempts
    throw PollingError.timeout(this.config.maxAttempts, metadata)
  }

  private calculateDelay(attempt: number): number {
    const baseDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt),
      this.config.maxDelayMs,
    )

    const jitterFactor = this.config.jitterFactor ?? 0.2
    const jitter = baseDelay * jitterFactor * (Math.random() - 0.5)

    return Math.round(baseDelay + jitter)
  }
}
