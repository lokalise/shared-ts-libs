import type { RequestContext } from '@lokalise/fastify-extras'
import type { PollResult } from '../Poller.ts'

export interface PollingStrategy {
  /**
   * Execute polling with the strategy's specific retry logic.
   *
   * @param pollFn - Function that returns PollResult. Should throw domain-specific
   *                 errors for terminal failure states.
   * @param reqContext - Request context for logging
   * @param metadata - Additional context for logging
   * @throws PollingError.timeout if max attempts exceeded
   * @throws Any domain-specific errors thrown by pollFn
   */
  execute<T>(
    pollFn: () => Promise<PollResult<T>>,
    reqContext: RequestContext,
    metadata?: Record<string, unknown>,
  ): Promise<T>
}
