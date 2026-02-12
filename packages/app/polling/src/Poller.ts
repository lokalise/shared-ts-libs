import type { PollingFailureCause } from './PollingError.ts'

export type PollResult<T> = { isComplete: true; value: T } | { isComplete: false }

/**
 * Hooks for observing polling lifecycle events.
 * All hooks are optional - provide only the ones you need for logging, metrics, etc.
 */
export interface PollingHooks {
  /** Called after each poll attempt completes (regardless of result) */
  onAttempt?: (context: { attempt: number; isComplete: boolean }) => void

  /** Called before waiting/delaying between attempts */
  onWait?: (context: { attempt: number; waitMs: number }) => void

  /** Called when polling completes successfully */
  onSuccess?: (context: { totalAttempts: number }) => void

  /** Called when polling fails (timeout or cancellation) */
  onFailure?: (context: { cause: PollingFailureCause; attemptsMade: number }) => void
}

/**
 * Options for configuring polling behavior.
 */
export interface PollingOptions {
  /** Optional lifecycle hooks for observability */
  hooks?: PollingHooks
  /** Optional AbortSignal to cancel polling */
  signal?: AbortSignal
}

export interface PollingStrategy {
  /**
   * Execute polling with the strategy's specific retry logic.
   *
   * @param pollFn - Function that returns PollResult. Receives the current attempt number (1-based).
   *                 Should throw domain-specific errors for terminal failure states.
   * @param options - Optional polling options including hooks and signal
   * @throws PollingError with cause TIMEOUT if max attempts exceeded
   * @throws PollingError with cause CANCELLED if signal is aborted
   * @throws Any domain-specific errors thrown by pollFn
   */
  execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T>
}

export class Poller {
  private readonly strategy: PollingStrategy

  constructor(strategy: PollingStrategy) {
    this.strategy = strategy
  }

  /**
   * Polls until complete or timeout using the configured strategy.
   *
   * @param pollFn - Function that returns PollResult. Receives the current attempt number (1-based).
   *                 Should throw domain-specific errors for terminal failure states.
   * @param options - Optional polling options including hooks and signal
   * @throws PollingError with cause TIMEOUT if max attempts exceeded
   * @throws PollingError with cause CANCELLED if signal is aborted
   * @throws Any domain-specific errors thrown by pollFn
   */
  poll<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options?: PollingOptions,
  ): Promise<T> {
    return this.strategy.execute(pollFn, options)
  }
}
