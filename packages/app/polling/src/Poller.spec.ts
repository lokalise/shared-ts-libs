import type { RequestContext } from "@lokalise/fastify-extras";
import { describe, expect, it } from "vitest";
import { Poller, type PollResult } from "./Poller.ts";
import { PollingError, PollingFailureCause } from "./PollingError.ts";
import type { PollingStrategy } from "./strategies/PollingStrategy.ts";

// Test helper to create a minimal request context
function createTestContext(): RequestContext {
	return {
		logger: {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		},
		reqId: "test-req-id",
	} as unknown as RequestContext;
}

describe("Poller", () => {
	describe("delegation to strategy", () => {
		it("should delegate to strategy and return result", async () => {
			// Create a simple strategy that succeeds immediately
			const simpleStrategy: PollingStrategy = {
				async execute<T>(
					pollFn: (attempt: number) => Promise<PollResult<T>>,
					_reqContext: RequestContext,
					_metadata?: Record<string, unknown>,
					_signal?: AbortSignal,
				): Promise<T> {
					const result = await pollFn(1);
					if (result.isComplete) {
						return result.value;
					}
					throw new Error("Should not reach here");
				},
			};

			const poller = new Poller(simpleStrategy);

			const result = await poller.poll<string>(
				async () => ({ isComplete: true, value: "test-result" }),
				createTestContext(),
			);

			expect(result).toBe("test-result");
		});

		it("should pass all parameters to strategy", async () => {
			let receivedPollFn:
				| ((attempt: number) => Promise<PollResult<string>>)
				| null = null;
			let receivedContext: RequestContext | null = null;
			let receivedMetadata: Record<string, unknown> | undefined;
			let receivedSignal: AbortSignal | undefined;

			const capturingStrategy: PollingStrategy = {
				async execute<T>(
					pollFn: (attempt: number) => Promise<PollResult<T>>,
					reqContext: RequestContext,
					metadata?: Record<string, unknown>,
					signal?: AbortSignal,
				): Promise<T> {
					receivedPollFn = pollFn as (
						attempt: number,
					) => Promise<PollResult<string>>;
					receivedContext = reqContext;
					receivedMetadata = metadata;
					receivedSignal = signal;

					const result = await pollFn(1);
					if (result.isComplete) {
						return result.value;
					}
					throw new Error("Should not reach here");
				},
			};

			const poller = new Poller(capturingStrategy);
			const context = createTestContext();
			const metadata = { testId: "test-123", userId: "user-456" };
			const controller = new AbortController();

			await poller.poll<string>(
				async () => ({ isComplete: true, value: "result" }),
				context,
				metadata,
				controller.signal,
			);

			expect(receivedPollFn).not.toBeNull();
			expect(receivedContext).toBe(context);
			expect(receivedMetadata).toEqual(metadata);
			expect(receivedSignal).toBe(controller.signal);
		});

		it("should propagate errors from strategy", async () => {
			const failingStrategy: PollingStrategy = {
				async execute<T>(): Promise<T> {
					throw PollingError.timeout(5, { testId: "error-test" });
				},
			};

			const poller = new Poller(failingStrategy);

			await expect(
				poller.poll<string>(
					async () => ({ isComplete: false }),
					createTestContext(),
				),
			).rejects.toMatchObject({
				name: "PollingError",
				failureCause: PollingFailureCause.TIMEOUT,
				attemptsMade: 5,
			});
		});
	});

	describe("poll function behavior", () => {
		it("should work with different return types", async () => {
			const immediateStrategy: PollingStrategy = {
				async execute<T>(
					pollFn: (attempt: number) => Promise<PollResult<T>>,
				): Promise<T> {
					const result = await pollFn(1);
					if (result.isComplete) {
						return result.value;
					}
					throw new Error("Incomplete");
				},
			};

			const poller = new Poller(immediateStrategy);

			// String result
			const stringResult = await poller.poll<string>(
				async () => ({ isComplete: true, value: "hello" }),
				createTestContext(),
			);
			expect(stringResult).toBe("hello");

			// Number result
			const numberResult = await poller.poll<number>(
				async () => ({ isComplete: true, value: 42 }),
				createTestContext(),
			);
			expect(numberResult).toBe(42);

			// Object result
			const objectResult = await poller.poll<{ id: string; status: string }>(
				async () => ({
					isComplete: true,
					value: { id: "test-id", status: "done" },
				}),
				createTestContext(),
			);
			expect(objectResult).toEqual({ id: "test-id", status: "done" });

			// Array result
			const arrayResult = await poller.poll<number[]>(
				async () => ({ isComplete: true, value: [1, 2, 3] }),
				createTestContext(),
			);
			expect(arrayResult).toEqual([1, 2, 3]);
		});

		it("should handle pollFn that uses attempt number", async () => {
			const attemptAwareStrategy: PollingStrategy = {
				async execute<T>(
					pollFn: (attempt: number) => Promise<PollResult<T>>,
				): Promise<T> {
					for (let attempt = 1; attempt <= 3; attempt++) {
						const result = await pollFn(attempt);
						if (result.isComplete) {
							return result.value;
						}
					}
					throw new Error("Max attempts");
				},
			};

			const poller = new Poller(attemptAwareStrategy);
			const attempts: number[] = [];

			const result = await poller.poll<string>(async (attempt) => {
				attempts.push(attempt);
				if (attempt === 3) {
					return { isComplete: true, value: `completed-at-${attempt}` };
				}
				return { isComplete: false };
			}, createTestContext());

			expect(result).toBe("completed-at-3");
			expect(attempts).toEqual([1, 2, 3]);
		});
	});

	describe("integration scenarios", () => {
		it("should work with retry logic in strategy", async () => {
			// Simple retry strategy that tries 3 times
			const retryStrategy: PollingStrategy = {
				async execute<T>(
					pollFn: (attempt: number) => Promise<PollResult<T>>,
					_reqContext: RequestContext,
					metadata?: Record<string, unknown>,
				): Promise<T> {
					for (let attempt = 1; attempt <= 3; attempt++) {
						const result = await pollFn(attempt);
						if (result.isComplete) {
							return result.value;
						}
					}
					throw PollingError.timeout(3, metadata);
				},
			};

			const poller = new Poller(retryStrategy);

			// Success case
			const successResult = await poller.poll<string>(async (attempt) => {
				if (attempt === 2) {
					return { isComplete: true, value: "success" };
				}
				return { isComplete: false };
			}, createTestContext());
			expect(successResult).toBe("success");

			// Timeout case
			await expect(
				poller.poll<string>(
					async () => ({ isComplete: false }),
					createTestContext(),
					{
						jobId: "timeout-job",
					},
				),
			).rejects.toMatchObject({
				failureCause: PollingFailureCause.TIMEOUT,
				details: { jobId: "timeout-job" },
			});
		});

		it("should support cancellation through strategy", async () => {
			const cancellableStrategy: PollingStrategy = {
				async execute<T>(
					pollFn: (attempt: number) => Promise<PollResult<T>>,
					_reqContext: RequestContext,
					metadata?: Record<string, unknown>,
					signal?: AbortSignal,
				): Promise<T> {
					if (signal?.aborted) {
						throw PollingError.cancelled(0, metadata);
					}

					for (let attempt = 1; attempt <= 5; attempt++) {
						if (signal?.aborted) {
							throw PollingError.cancelled(attempt - 1, metadata);
						}

						const result = await pollFn(attempt);
						if (result.isComplete) {
							return result.value;
						}
					}

					throw PollingError.timeout(5, metadata);
				},
			};

			const poller = new Poller(cancellableStrategy);

			// Pre-cancelled signal
			const controller1 = new AbortController();
			controller1.abort();

			await expect(
				poller.poll<string>(
					async () => ({ isComplete: false }),
					createTestContext(),
					{ test: "pre-cancelled" },
					controller1.signal,
				),
			).rejects.toMatchObject({
				failureCause: PollingFailureCause.CANCELLED,
				attemptsMade: 0,
			});
		});

		it("should work with domain-specific errors", async () => {
			const errorPassthroughStrategy: PollingStrategy = {
				async execute<T>(
					pollFn: (attempt: number) => Promise<PollResult<T>>,
				): Promise<T> {
					// Strategy just calls pollFn once and lets errors propagate
					const result = await pollFn(1);
					if (result.isComplete) {
						return result.value;
					}
					throw new Error("Not complete");
				},
			};

			const poller = new Poller(errorPassthroughStrategy);

			class DomainError extends Error {
				constructor(message: string) {
					super(message);
					this.name = "DomainError";
				}
			}

			await expect(
				poller.poll<string>(async () => {
					throw new DomainError("Business logic failure");
				}, createTestContext()),
			).rejects.toThrow(DomainError);
		});
	});
});
