import { setTimeout } from 'node:timers/promises'
import type { RequestContext } from '@lokalise/fastify-extras'
import { describe, expect, it } from 'vitest'
import { PollingError, PollingFailureCause } from '../PollingError.ts'
import {
  ExponentialBackoffStrategy,
  STANDARD_EXPONENTIAL_BACKOFF_CONFIG,
} from './ExponentialBackoffStrategy.ts'

// Test helper to create a minimal request context
function createTestContext(): RequestContext {
  return {
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    reqId: 'test-req-id',
  } as unknown as RequestContext
}

describe('ExponentialBackoffStrategy', () => {
  describe('configuration validation', () => {
    it('should accept valid configuration', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            maxAttempts: 5,
            jitterFactor: 0.2,
          }),
      ).not.toThrow()
    })

    it('should reject negative initialDelayMs', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: -100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            maxAttempts: 5,
          }),
      ).toThrow('initialDelayMs must be a non-negative finite number')
    })

    it('should reject negative maxDelayMs', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: -1000,
            backoffMultiplier: 2,
            maxAttempts: 5,
          }),
      ).toThrow('maxDelayMs must be a non-negative finite number')
    })

    it('should reject initialDelayMs greater than maxDelayMs', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 2000,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            maxAttempts: 5,
          }),
      ).toThrow('initialDelayMs must not exceed maxDelayMs')
    })

    it('should reject non-positive backoffMultiplier', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 0,
            maxAttempts: 5,
          }),
      ).toThrow('backoffMultiplier must be a positive finite number')

      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: -1,
            maxAttempts: 5,
          }),
      ).toThrow('backoffMultiplier must be a positive finite number')
    })

    it('should reject non-positive maxAttempts', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            maxAttempts: 0,
          }),
      ).toThrow('maxAttempts must be a positive integer')
    })

    it('should reject jitterFactor outside 0-1 range', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            maxAttempts: 5,
            jitterFactor: -0.1,
          }),
      ).toThrow('jitterFactor must be a finite number between 0 and 1')

      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            maxAttempts: 5,
            jitterFactor: 1.5,
          }),
      ).toThrow('jitterFactor must be a finite number between 0 and 1')
    })

    it('should accept jitterFactor of 0', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            maxAttempts: 5,
            jitterFactor: 0,
          }),
      ).not.toThrow()
    })

    it('should accept jitterFactor of 1', () => {
      expect(
        () =>
          new ExponentialBackoffStrategy({
            initialDelayMs: 100,
            maxDelayMs: 1000,
            backoffMultiplier: 2,
            maxAttempts: 5,
            jitterFactor: 1,
          }),
      ).not.toThrow()
    })
  })

  describe('successful polling', () => {
    it('should complete immediately if first attempt succeeds', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        maxAttempts: 5,
      })

      let attemptCount = 0
      const result = await strategy.execute<string>((attempt) => {
        attemptCount = attempt
        return Promise.resolve({ isComplete: true, value: 'success' })
      }, createTestContext())

      expect(result).toBe('success')
      expect(attemptCount).toBe(1)
    })

    it('should retry and complete on third attempt', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 500,
        backoffMultiplier: 2,
        maxAttempts: 5,
        jitterFactor: 0, // Disable jitter for predictable timing
      })

      const attempts: number[] = []
      const startTime = Date.now()

      const result = await strategy.execute<string>((attempt) => {
        attempts.push(attempt)
        if (attempt < 3) {
          return Promise.resolve({ isComplete: false })
        }
        return Promise.resolve({ isComplete: true, value: `completed-after-${attempt}` })
      }, createTestContext())

      const elapsed = Date.now() - startTime

      expect(result).toBe('completed-after-3')
      expect(attempts).toEqual([1, 2, 3])
      // Should have waited ~50ms + ~100ms = ~150ms total (with some tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(130)
      expect(elapsed).toBeLessThan(300)
    })

    it('should complete just before timeout', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 5,
        jitterFactor: 0,
      })

      const attempts: number[] = []

      const result = await strategy.execute<number>((attempt) => {
        attempts.push(attempt)
        if (attempt === 5) {
          return Promise.resolve({ isComplete: true, value: 42 })
        }
        return Promise.resolve({ isComplete: false })
      }, createTestContext())

      expect(result).toBe(42)
      expect(attempts).toEqual([1, 2, 3, 4, 5])
    })

    it('should pass attempt number correctly', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 3,
        jitterFactor: 0,
      })

      const receivedAttempts: number[] = []

      await strategy.execute<void>((attempt) => {
        receivedAttempts.push(attempt)
        if (attempt === 3) {
          return Promise.resolve({ isComplete: true, value: undefined })
        }
        return Promise.resolve({ isComplete: false })
      }, createTestContext())

      expect(receivedAttempts).toEqual([1, 2, 3])
    })
  })

  describe('timeout behavior', () => {
    it('should throw PollingError.timeout when max attempts exceeded', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 3,
        jitterFactor: 0,
      })

      await expect(
        strategy.execute<string>(
          () => {
            return Promise.resolve({ isComplete: false })
          },
          createTestContext(),
          { testId: 'test-123' },
        ),
      ).rejects.toMatchObject({
        name: 'PollingError',
        failureCause: PollingFailureCause.TIMEOUT,
        attemptsMade: 3,
        errorCode: 'POLLING_TIMEOUT',
        details: {
          failureCause: PollingFailureCause.TIMEOUT,
          attemptsMade: 3,
          testId: 'test-123',
        },
      })
    })

    it('should include metadata in timeout error', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 2,
        jitterFactor: 0,
      })

      try {
        await strategy.execute<string>(
          () => Promise.resolve({ isComplete: false }),
          createTestContext(),
          {
            jobId: 'job-456',
            userId: 'user-789',
          },
        )
        expect.fail('Should have thrown PollingError')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.details).toMatchObject({
          jobId: 'job-456',
          userId: 'user-789',
          attemptsMade: 2,
        })
      }
    })
  })

  describe('cancellation behavior', () => {
    it('should throw PollingError.cancelled when signal is aborted before first attempt', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        maxAttempts: 5,
      })

      const controller = new AbortController()
      controller.abort()

      await expect(
        strategy.execute<string>(
          () => {
            return Promise.resolve({ isComplete: false })
          },
          createTestContext(),
          { testId: 'abort-test' },
          controller.signal,
        ),
      ).rejects.toMatchObject({
        name: 'PollingError',
        failureCause: PollingFailureCause.CANCELLED,
        attemptsMade: 0,
        errorCode: 'POLLING_CANCELLED',
        details: {
          testId: 'abort-test',
        },
      })
    })

    it('should throw PollingError.cancelled when signal is aborted during polling', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        maxAttempts: 10,
        jitterFactor: 0,
      })

      const controller = new AbortController()
      const attempts: number[] = []

      // Abort after 250ms (should be during second wait)
      setTimeout(250).then(() => controller.abort())

      try {
        await strategy.execute<string>(
          (attempt) => {
            attempts.push(attempt)
            return Promise.resolve({ isComplete: false })
          },
          createTestContext(),
          { testId: 'abort-during' },
          controller.signal,
        )
        expect.fail('Should have thrown PollingError')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.failureCause).toBe(PollingFailureCause.CANCELLED)
        // Should have made 2-3 attempts before cancellation
        expect(pollingError.attemptsMade).toBeGreaterThanOrEqual(2)
        expect(pollingError.attemptsMade).toBeLessThanOrEqual(3)
      }
    })

    it('should not throw cancellation error if completed before abort', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 5,
        jitterFactor: 0,
      })

      const controller = new AbortController()

      // Abort after 500ms (polling will complete first)
      setTimeout(500).then(() => controller.abort())

      const result = await strategy.execute<string>(
        (attempt) => {
          if (attempt === 2) {
            return Promise.resolve({ isComplete: true, value: 'success' })
          }
          return Promise.resolve({ isComplete: false })
        },
        createTestContext(),
        undefined,
        controller.signal,
      )

      expect(result).toBe('success')
    })
  })

  describe('error propagation', () => {
    it('should propagate errors thrown by pollFn', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 5,
      })

      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }

      await expect(
        strategy.execute<string>((attempt) => {
          if (attempt === 2) {
            throw new CustomError('Operation failed permanently')
          }
          return Promise.resolve({ isComplete: false })
        }, createTestContext()),
      ).rejects.toThrow(CustomError)
    })

    it('should propagate errors immediately without retry', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 10,
        jitterFactor: 0,
      })

      const attempts: number[] = []

      await expect(
        strategy.execute<string>((attempt) => {
          attempts.push(attempt)
          if (attempt === 3) {
            throw new Error('Terminal error')
          }
          return Promise.resolve({ isComplete: false })
        }, createTestContext()),
      ).rejects.toThrow('Terminal error')

      // Should have stopped immediately after error on attempt 3
      expect(attempts).toEqual([1, 2, 3])
    })
  })

  describe('delay calculation', () => {
    it('should respect maxDelayMs cap even with jitter', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 100,
        maxDelayMs: 200,
        backoffMultiplier: 3,
        maxAttempts: 10,
        jitterFactor: 0.5, // High jitter
      })

      const delays: number[] = []
      const attempts: number[] = []

      try {
        await strategy.execute<string>((attempt) => {
          attempts.push(attempt)
          const now = Date.now()
          if (attempts.length > 1) {
            delays.push(now - lastTime)
          }
          lastTime = now
          return Promise.resolve({ isComplete: false })
        }, createTestContext())
      } catch (_error) {
        // Expected timeout
      }

      let lastTime = Date.now()

      // All delays should be <= maxDelayMs + small tolerance for execution time
      for (const delay of delays) {
        expect(delay).toBeLessThanOrEqual(250) // 200ms + 50ms tolerance
      }
    })

    it('should use fixed interval when backoffMultiplier is 1', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 100,
        maxDelayMs: 100,
        backoffMultiplier: 1,
        maxAttempts: 4,
        jitterFactor: 0,
      })

      const timestamps: number[] = []

      try {
        await strategy.execute<string>(() => {
          timestamps.push(Date.now())
          return Promise.resolve({ isComplete: false })
        }, createTestContext())
      } catch (_error) {
        // Expected timeout
      }

      // Check delays between consecutive attempts
      for (let i = 1; i < timestamps.length; i++) {
        const current = timestamps[i]
        const previous = timestamps[i - 1]
        if (current !== undefined && previous !== undefined) {
          const delay = current - previous
          // Should be ~100ms each time (with tolerance)
          expect(delay).toBeGreaterThanOrEqual(90)
          expect(delay).toBeLessThan(150)
        }
      }
    })

    it('should allow zero delay configuration', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 0,
        maxDelayMs: 0,
        backoffMultiplier: 1,
        maxAttempts: 3,
        jitterFactor: 0,
      })

      const startTime = Date.now()

      try {
        await strategy.execute<string>(
          () => Promise.resolve({ isComplete: false }),
          createTestContext(),
        )
      } catch (_error) {
        // Expected timeout
      }

      const elapsed = Date.now() - startTime

      // Should complete very quickly with no delays
      expect(elapsed).toBeLessThan(50)
    })
  })

  describe('standard configuration', () => {
    it('should export a working standard configuration', () => {
      expect(STANDARD_EXPONENTIAL_BACKOFF_CONFIG).toEqual({
        initialDelayMs: 2000,
        maxDelayMs: 15000,
        backoffMultiplier: 1.5,
        maxAttempts: 20,
        jitterFactor: 0.2,
      })
    })

    it('should work with standard configuration', async () => {
      const strategy = new ExponentialBackoffStrategy(STANDARD_EXPONENTIAL_BACKOFF_CONFIG)

      const result = await strategy.execute<number>((attempt) => {
        if (attempt === 2) {
          return Promise.resolve({ isComplete: true, value: 100 })
        }
        return Promise.resolve({ isComplete: false })
      }, createTestContext())

      expect(result).toBe(100)
    })
  })

  describe('real-world scenarios', () => {
    it('should handle async database-like polling', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 10,
        jitterFactor: 0.1,
      })

      // Simulate a database record that becomes ready after some time
      let recordStatus = 'pending'
      setTimeout(150).then(() => {
        recordStatus = 'ready'
      })

      const result = await strategy.execute<{ status: string; data: string }>(() => {
        if (recordStatus === 'ready') {
          return Promise.resolve({
            isComplete: true,
            value: { status: 'ready', data: 'result-data' },
          })
        }
        return Promise.resolve({ isComplete: false })
      }, createTestContext())

      expect(result).toEqual({ status: 'ready', data: 'result-data' })
    })

    it('should handle file processing scenario', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 30,
        maxDelayMs: 100,
        backoffMultiplier: 1.5,
        maxAttempts: 15,
        jitterFactor: 0.2,
      })

      // Simulate file processing that takes multiple checks
      let processedChunks = 0
      const totalChunks = 5
      const processInterval = setInterval(() => {
        processedChunks++
        if (processedChunks >= totalChunks) {
          clearInterval(processInterval)
        }
      }, 40)

      const result = await strategy.execute<{
        chunks: number
        complete: boolean
      }>(() => {
        if (processedChunks >= totalChunks) {
          return Promise.resolve({
            isComplete: true,
            value: { chunks: processedChunks, complete: true },
          })
        }
        return Promise.resolve({ isComplete: false })
      }, createTestContext())

      clearInterval(processInterval)
      expect(result.complete).toBe(true)
      expect(result.chunks).toBe(totalChunks)
    })

    it('should handle job queue scenario with terminal failure', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 10,
        jitterFactor: 0,
      })

      // Simulate a job that fails permanently after some attempts
      let jobStatus = 'processing'
      setTimeout(150).then(() => {
        jobStatus = 'failed'
      })

      await expect(
        strategy.execute<string>(() => {
          if (jobStatus === 'failed') {
            throw new Error('Job processing failed permanently')
          }
          if (jobStatus === 'completed') {
            return Promise.resolve({ isComplete: true, value: 'job-result' })
          }
          return Promise.resolve({ isComplete: false })
        }, createTestContext()),
      ).rejects.toThrow('Job processing failed permanently')
    })
  })
})
