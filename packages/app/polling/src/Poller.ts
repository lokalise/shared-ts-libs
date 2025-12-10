import type { RequestContext } from '@lokalise/fastify-extras'
import type { PollingStrategy } from './strategies/PollingStrategy.ts'

export type PollResult<T> = { isComplete: true; value: T } | { isComplete: false; value?: never }

export class Poller {
  private readonly strategy: PollingStrategy

  constructor(strategy: PollingStrategy) {
    this.strategy = strategy
  }

  /**
   * Polls until complete or timeout using the configured strategy.
   *
   * @param pollFn - Function that returns PollResult. Should throw domain-specific
   *                 errors for terminal failure states.
   * @param reqContext - Request context for logging
   * @param metadata - Additional context for logging
   * @throws PollingError.timeout if max attempts exceeded
   * @throws Any domain-specific errors thrown by pollFn
   */
  poll<T>(
    pollFn: () => Promise<PollResult<T>>,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    return this.strategy.execute(pollFn, reqContext, metadata)
  }
}
