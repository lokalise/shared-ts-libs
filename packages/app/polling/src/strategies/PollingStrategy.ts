import type { RequestContext } from "@lokalise/fastify-extras";
import type { PollResult } from "../Poller.ts";

export interface PollingStrategy {
	/**
	 * Execute polling with the strategy's specific retry logic.
	 *
	 * @param pollFn - Function that returns PollResult. Receives the current attempt number (1-based).
	 *                 Should throw domain-specific errors for terminal failure states.
	 * @param reqContext - Request context for logging
	 * @param metadata - Additional context for logging
	 * @param signal - Optional AbortSignal to cancel polling
	 * @throws PollingError.timeout if max attempts exceeded
	 * @throws PollingError.cancelled if signal is aborted
	 * @throws Any domain-specific errors thrown by pollFn
	 */
	execute<T>(
		pollFn: (attempt: number) => Promise<PollResult<T>>,
		reqContext: RequestContext,
		metadata?: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<T>;
}
