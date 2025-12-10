import { InternalError } from "@lokalise/node-core";
import { describe, expect, it } from "vitest";
import { PollingError, PollingFailureCause } from "./PollingError.ts";

describe("PollingError", () => {
	describe("construction", () => {
		it("should create error with all properties", () => {
			const error = new PollingError(
				"Test error message",
				PollingFailureCause.TIMEOUT,
				5,
				{
					jobId: "job-123",
				},
			);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(InternalError);
			expect(error).toBeInstanceOf(PollingError);
			expect(error.name).toBe("PollingError");
			expect(error.message).toBe("Test error message");
			expect(error.failureCause).toBe(PollingFailureCause.TIMEOUT);
			expect(error.attemptsMade).toBe(5);
			expect(error.errorCode).toBe("POLLING_TIMEOUT");
			expect(error.details).toEqual({
				failureCause: PollingFailureCause.TIMEOUT,
				attemptsMade: 5,
				jobId: "job-123",
			});
		});

		it("should merge metadata into details", () => {
			const error = new PollingError("Test", PollingFailureCause.CANCELLED, 3, {
				userId: "user-456",
				sessionId: "session-789",
				extraData: { nested: "value" },
			});

			expect(error.details).toEqual({
				failureCause: PollingFailureCause.CANCELLED,
				attemptsMade: 3,
				userId: "user-456",
				sessionId: "session-789",
				extraData: { nested: "value" },
			});
		});

		it("should work without metadata", () => {
			const error = new PollingError("Test", PollingFailureCause.TIMEOUT, 10);

			expect(error.details).toEqual({
				failureCause: PollingFailureCause.TIMEOUT,
				attemptsMade: 10,
			});
		});

		it("should preserve original error as cause", () => {
			const originalError = new Error("Original error");
			const error = new PollingError(
				"Polling failed",
				PollingFailureCause.TIMEOUT,
				5,
				undefined,
				originalError,
			);

			expect(error.cause).toBe(originalError);
		});
	});

	describe("factory methods", () => {
		describe("timeout", () => {
			it("should create timeout error with correct properties", () => {
				const error = PollingError.timeout(10);

				expect(error).toBeInstanceOf(PollingError);
				expect(error.message).toBe("Polling timeout after 10 attempts");
				expect(error.failureCause).toBe(PollingFailureCause.TIMEOUT);
				expect(error.attemptsMade).toBe(10);
				expect(error.errorCode).toBe("POLLING_TIMEOUT");
			});

			it("should include metadata when provided", () => {
				const error = PollingError.timeout(5, {
					jobId: "job-123",
					reason: "slow-service",
				});

				expect(error.details).toEqual({
					failureCause: PollingFailureCause.TIMEOUT,
					attemptsMade: 5,
					jobId: "job-123",
					reason: "slow-service",
				});
			});

			it("should work with zero attempts", () => {
				const error = PollingError.timeout(0);

				expect(error.message).toBe("Polling timeout after 0 attempts");
				expect(error.attemptsMade).toBe(0);
			});

			it("should work with large attempt numbers", () => {
				const error = PollingError.timeout(1000);

				expect(error.message).toBe("Polling timeout after 1000 attempts");
				expect(error.attemptsMade).toBe(1000);
			});
		});

		describe("cancelled", () => {
			it("should create cancelled error with correct properties", () => {
				const error = PollingError.cancelled(3);

				expect(error).toBeInstanceOf(PollingError);
				expect(error.message).toBe("Polling cancelled after 3 attempts");
				expect(error.failureCause).toBe(PollingFailureCause.CANCELLED);
				expect(error.attemptsMade).toBe(3);
				expect(error.errorCode).toBe("POLLING_CANCELLED");
			});

			it("should include metadata when provided", () => {
				const error = PollingError.cancelled(7, {
					userId: "user-456",
					reason: "user-action",
				});

				expect(error.details).toEqual({
					failureCause: PollingFailureCause.CANCELLED,
					attemptsMade: 7,
					userId: "user-456",
					reason: "user-action",
				});
			});

			it("should work when cancelled before any attempts", () => {
				const error = PollingError.cancelled(0);

				expect(error.message).toBe("Polling cancelled after 0 attempts");
				expect(error.attemptsMade).toBe(0);
			});
		});
	});

	describe("error code generation", () => {
		it("should generate POLLING_TIMEOUT for timeout errors", () => {
			const error = new PollingError("Test", PollingFailureCause.TIMEOUT, 5);
			expect(error.errorCode).toBe("POLLING_TIMEOUT");
		});

		it("should generate POLLING_CANCELLED for cancelled errors", () => {
			const error = new PollingError("Test", PollingFailureCause.CANCELLED, 5);
			expect(error.errorCode).toBe("POLLING_CANCELLED");
		});
	});

	describe("discriminated union support", () => {
		it("should support type discrimination by failureCause", () => {
			const timeoutError = PollingError.timeout(10);
			const cancelledError = PollingError.cancelled(5);

			function handleError(error: PollingError): string {
				switch (error.failureCause) {
					case PollingFailureCause.TIMEOUT:
						return `Timed out after ${error.attemptsMade} attempts`;
					case PollingFailureCause.CANCELLED:
						return `Cancelled after ${error.attemptsMade} attempts`;
				}
			}

			expect(handleError(timeoutError)).toBe("Timed out after 10 attempts");
			expect(handleError(cancelledError)).toBe("Cancelled after 5 attempts");
		});
	});

	describe("PollingFailureCause constants", () => {
		it("should export correct constant values", () => {
			expect(PollingFailureCause.TIMEOUT).toBe("TIMEOUT");
			expect(PollingFailureCause.CANCELLED).toBe("CANCELLED");
		});

		it("should have exactly two causes", () => {
			const causes = Object.keys(PollingFailureCause);
			expect(causes).toHaveLength(2);
			expect(causes).toContain("TIMEOUT");
			expect(causes).toContain("CANCELLED");
		});
	});

	describe("error handling patterns", () => {
		it("should be catchable as PollingError", () => {
			function mayThrowPollingError(): void {
				throw PollingError.timeout(5);
			}

			try {
				mayThrowPollingError();
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(PollingError);
				if (error instanceof PollingError) {
					expect(error.attemptsMade).toBe(5);
				}
			}
		});

		it("should be catchable as InternalError", () => {
			function mayThrowPollingError(): void {
				throw PollingError.cancelled(3, { reason: "test" });
			}

			try {
				mayThrowPollingError();
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(InternalError);
				if (error instanceof InternalError) {
					expect(error.errorCode).toBe("POLLING_CANCELLED");
					expect(error.details).toMatchObject({ reason: "test" });
				}
			}
		});

		it("should support instanceof checks in catch blocks", () => {
			const errors = [
				PollingError.timeout(10),
				PollingError.cancelled(5),
				new Error("Other"),
			];

			const results = errors.map((error) => {
				if (error instanceof PollingError) {
					return `polling:${error.failureCause}`;
				}
				return "other";
			});

			expect(results).toEqual([
				"polling:TIMEOUT",
				"polling:CANCELLED",
				"other",
			]);
		});
	});
});
