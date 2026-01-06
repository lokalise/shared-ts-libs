/**
 * Minimal request context interface for logging and request identification.
 * Provides a basic structure for passing logging capabilities through polling operations.
 */
export interface RequestContext {
  /** Logger instance with standard logging methods */
  logger: {
    debug: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
  /** Unique request identifier for correlation */
  reqId: string
}

export type PollResult<T> = { isComplete: true; value: T } | { isComplete: false }

/**
 * Options for configuring polling behavior.
 */
export interface PollingOptions {
  /** Request context for logging and request identification */
  reqContext: RequestContext
  /** Additional metadata for logging and error reporting */
  metadata?: Record<string, unknown>
  /** Optional AbortSignal to cancel polling */
  signal?: AbortSignal
}

export interface PollingStrategy {
  /**
   * Execute polling with the strategy's specific retry logic.
   *
   * @param pollFn - Function that returns PollResult. Receives the current attempt number (1-based).
   *                 Should throw domain-specific errors for terminal failure states.
   * @param options - Polling options including context, metadata, and signal
   * @throws PollingError.timeout if max attempts exceeded
   * @throws PollingError.cancelled if signal is aborted
   * @throws Any domain-specific errors thrown by pollFn
   */
  execute<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options: PollingOptions,
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
   * @param options - Polling options including context, metadata, and signal
   * @throws PollingError.timeout if max attempts exceeded
   * @throws PollingError.cancelled if signal is aborted
   * @throws Any domain-specific errors thrown by pollFn
   */
  poll<T>(
    pollFn: (attempt: number) => Promise<PollResult<T>>,
    options: PollingOptions,
  ): Promise<T> {
    return this.strategy.execute(pollFn, options)
  }
}
