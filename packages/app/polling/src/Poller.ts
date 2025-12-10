import type { RequestContext } from "@lokalise/fastify-extras";
import type { PollingStrategy } from "./strategies/PollingStrategy.ts";

export type PollResult<T> =
	| { isComplete: true; value: T }
	| { isComplete: false };

export class Poller {
	private readonly strategy: PollingStrategy;

	constructor(strategy: PollingStrategy) {
		this.strategy = strategy;
	}

	/**
	 * Polls until complete or timeout using the configured strategy.
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
	poll<T>(
		pollFn: (attempt: number) => Promise<PollResult<T>>,
		reqContext: RequestContext,
		metadata?: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<T> {
		return this.strategy.execute(pollFn, reqContext, metadata, signal);
	}
}
