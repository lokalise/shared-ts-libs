import { describe, expect, it } from 'vitest'
import { PollingError, PollingFailureCause } from '../PollingError.ts'
import { delay } from '../utils/delay.ts'
import {
  ExponentialBackoffStrategy,
  STANDARD_EXPONENTIAL_BACKOFF_CONFIG,
} from './ExponentialBackoffStrategy.ts'

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
      try {
        new ExponentialBackoffStrategy({
          initialDelayMs: -100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          maxAttempts: 5,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.message).toBe('initialDelayMs must be a non-negative finite number')
        expect(pollingError.failureCause).toBe(PollingFailureCause.INVALID_CONFIG)
        expect(pollingError.errorCode).toBe('POLLING_INVALID_CONFIG')
      }
    })

    it('should reject negative maxDelayMs', () => {
      try {
        new ExponentialBackoffStrategy({
          initialDelayMs: 100,
          maxDelayMs: -1000,
          backoffMultiplier: 2,
          maxAttempts: 5,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.message).toBe('maxDelayMs must be a non-negative finite number')
        expect(pollingError.failureCause).toBe(PollingFailureCause.INVALID_CONFIG)
      }
    })

    it('should reject initialDelayMs greater than maxDelayMs', () => {
      try {
        new ExponentialBackoffStrategy({
          initialDelayMs: 2000,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          maxAttempts: 5,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.message).toBe('initialDelayMs must not exceed maxDelayMs')
        expect(pollingError.failureCause).toBe(PollingFailureCause.INVALID_CONFIG)
      }
    })

    it('should reject non-positive backoffMultiplier', () => {
      try {
        new ExponentialBackoffStrategy({
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 0,
          maxAttempts: 5,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.message).toBe('backoffMultiplier must be a positive finite number')
        expect(pollingError.failureCause).toBe(PollingFailureCause.INVALID_CONFIG)
      }

      try {
        new ExponentialBackoffStrategy({
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: -1,
          maxAttempts: 5,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.message).toBe('backoffMultiplier must be a positive finite number')
        expect(pollingError.failureCause).toBe(PollingFailureCause.INVALID_CONFIG)
      }
    })

    it('should reject non-positive maxAttempts', () => {
      try {
        new ExponentialBackoffStrategy({
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          maxAttempts: 0,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.message).toBe('maxAttempts must be a positive integer')
        expect(pollingError.failureCause).toBe(PollingFailureCause.INVALID_CONFIG)
      }
    })

    it('should reject jitterFactor outside 0-1 range', () => {
      try {
        new ExponentialBackoffStrategy({
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          maxAttempts: 5,
          jitterFactor: -0.1,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.message).toBe('jitterFactor must be a finite number between 0 and 1')
        expect(pollingError.failureCause).toBe(PollingFailureCause.INVALID_CONFIG)
      }

      try {
        new ExponentialBackoffStrategy({
          initialDelayMs: 100,
          maxDelayMs: 1000,
          backoffMultiplier: 2,
          maxAttempts: 5,
          jitterFactor: 1.5,
        })
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.message).toBe('jitterFactor must be a finite number between 0 and 1')
        expect(pollingError.failureCause).toBe(PollingFailureCause.INVALID_CONFIG)
      }
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
      }, {})

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
      }, {})

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
      }, {})

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
      }, {})

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
        strategy.execute<string>(() => {
          return Promise.resolve({ isComplete: false })
        }, {}),
      ).rejects.toMatchObject({
        name: 'PollingError',
        failureCause: PollingFailureCause.TIMEOUT,
        attemptsMade: 3,
        errorCode: 'POLLING_TIMEOUT',
      })
    })

    it('should throw PollingError on timeout with correct properties', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 2,
        jitterFactor: 0,
      })

      try {
        await strategy.execute<string>(() => Promise.resolve({ isComplete: false }), {})
        expect.fail('Should have thrown PollingError')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.attemptsMade).toBe(2)
        expect(pollingError.failureCause).toBe(PollingFailureCause.TIMEOUT)
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
          {
            signal: controller.signal,
          },
        ),
      ).rejects.toMatchObject({
        name: 'PollingError',
        failureCause: PollingFailureCause.CANCELLED,
        attemptsMade: 0,
        errorCode: 'POLLING_CANCELLED',
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
      delay(250).then(() => controller.abort())

      try {
        await strategy.execute<string>(
          (attempt) => {
            attempts.push(attempt)
            return Promise.resolve({ isComplete: false })
          },
          {
            signal: controller.signal,
          },
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
      delay(500).then(() => controller.abort())

      const result = await strategy.execute<string>(
        (attempt) => {
          if (attempt === 2) {
            return Promise.resolve({ isComplete: true, value: 'success' })
          }
          return Promise.resolve({ isComplete: false })
        },
        {
          signal: controller.signal,
        },
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
        }, {}),
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
        }, {}),
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
      let lastTime = Date.now()

      try {
        await strategy.execute<string>((attempt) => {
          attempts.push(attempt)
          const now = Date.now()
          if (attempts.length > 1) {
            delays.push(now - lastTime)
          }
          lastTime = now
          return Promise.resolve({ isComplete: false })
        }, {})
      } catch (_error) {
        // Expected timeout
      }

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
        }, {})
      } catch (_error) {
        // Expected timeout
      }

      // Check delays between consecutive attempts
      for (let i = 1; i < timestamps.length; i++) {
        const current = timestamps[i]
        const previous = timestamps[i - 1]
        if (current !== undefined && previous !== undefined) {
          const delay = current - previous
          // Should be ~100ms each time (with tolerance for CI/slow environments)
          expect(delay).toBeGreaterThanOrEqual(90)
          expect(delay).toBeLessThan(200)
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
        await strategy.execute<string>(() => Promise.resolve({ isComplete: false }), {})
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
      }, {})

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
      delay(150).then(() => {
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
      }, {})

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
      }, {})

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
      delay(150).then(() => {
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
        }, {}),
      ).rejects.toThrow('Job processing failed permanently')
    })
  })

  describe('hooks integration', () => {
    it('should call onAttempt hook after each polling attempt', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 5,
        jitterFactor: 0,
      })

      const attemptCalls: Array<{ attempt: number; isComplete: boolean }> = []

      await strategy.execute<string>(
        (attempt) => {
          if (attempt === 3) {
            return Promise.resolve({ isComplete: true, value: 'success' })
          }
          return Promise.resolve({ isComplete: false })
        },
        {
          hooks: {
            onAttempt: (ctx) => {
              attemptCalls.push({ attempt: ctx.attempt, isComplete: ctx.isComplete })
            },
          },
        },
      )

      expect(attemptCalls).toEqual([
        { attempt: 1, isComplete: false },
        { attempt: 2, isComplete: false },
        { attempt: 3, isComplete: true },
      ])
    })

    it('should work without any options', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 3,
        jitterFactor: 0,
      })

      const result = await strategy.execute<string>((attempt) => {
        if (attempt === 2) {
          return Promise.resolve({ isComplete: true, value: 'success' })
        }
        return Promise.resolve({ isComplete: false })
      })

      expect(result).toBe('success')
    })

    it('should call onWait hook before each delay', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 5,
        jitterFactor: 0,
      })

      const waitCalls: Array<{ attempt: number; waitMs: number }> = []

      await strategy.execute<string>(
        (attempt) => {
          if (attempt === 3) {
            return Promise.resolve({ isComplete: true, value: 'success' })
          }
          return Promise.resolve({ isComplete: false })
        },
        {
          hooks: {
            onWait: (ctx) => {
              waitCalls.push({ attempt: ctx.attempt, waitMs: ctx.waitMs })
            },
          },
        },
      )

      // Should wait before attempt 2 and 3
      expect(waitCalls).toEqual([
        { attempt: 1, waitMs: 50 },
        { attempt: 2, waitMs: 100 },
      ])
    })

    it('should call onSuccess hook when polling completes', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 50,
        maxDelayMs: 200,
        backoffMultiplier: 2,
        maxAttempts: 5,
        jitterFactor: 0,
      })

      let successCalled = false
      let totalAttempts = 0

      await strategy.execute<string>(
        (attempt) => {
          if (attempt === 3) {
            return Promise.resolve({ isComplete: true, value: 'success' })
          }
          return Promise.resolve({ isComplete: false })
        },
        {
          hooks: {
            onSuccess: (ctx) => {
              successCalled = true
              totalAttempts = ctx.totalAttempts
            },
          },
        },
      )

      expect(successCalled).toBe(true)
      expect(totalAttempts).toBe(3)
    })

    it('should call onFailure hook when timeout occurs', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 10,
        maxDelayMs: 50,
        backoffMultiplier: 2,
        maxAttempts: 3,
        jitterFactor: 0,
      })

      let failureCalled = false
      let failureCause: string | undefined
      let attemptsMade = 0

      try {
        await strategy.execute<string>(() => Promise.resolve({ isComplete: false }), {
          hooks: {
            onFailure: (ctx) => {
              failureCalled = true
              failureCause = ctx.cause
              attemptsMade = ctx.attemptsMade
            },
          },
        })
        expect.fail('Should have thrown PollingError')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.failureCause).toBe(PollingFailureCause.TIMEOUT)
      }

      expect(failureCalled).toBe(true)
      expect(failureCause).toBe(PollingFailureCause.TIMEOUT)
      expect(attemptsMade).toBe(3)
    })

    it('should call onFailure when cancelled during delay', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        maxAttempts: 10,
        jitterFactor: 0,
      })

      const controller = new AbortController()
      let failureCalled = false
      let failureCause: string | undefined
      let attemptsMade = 0

      // Abort after 150ms (during second wait)
      delay(150).then(() => controller.abort())

      try {
        await strategy.execute<string>(() => Promise.resolve({ isComplete: false }), {
          signal: controller.signal,
          hooks: {
            onFailure: (ctx) => {
              failureCalled = true
              failureCause = ctx.cause
              attemptsMade = ctx.attemptsMade
            },
          },
        })
        expect.fail('Should have thrown PollingError')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.failureCause).toBe(PollingFailureCause.CANCELLED)
      }

      expect(failureCalled).toBe(true)
      expect(failureCause).toBe(PollingFailureCause.CANCELLED)
      expect(attemptsMade).toBeGreaterThanOrEqual(1)
      expect(attemptsMade).toBeLessThanOrEqual(2)
    })

    it('should call onFailure when signal is already aborted before polling starts', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        maxAttempts: 10,
        jitterFactor: 0,
      })

      const controller = new AbortController()
      controller.abort() // Abort before starting

      let failureCalled = false
      let failureCause: string | undefined
      let attemptsMade = 0

      try {
        await strategy.execute<string>(() => Promise.resolve({ isComplete: false }), {
          signal: controller.signal,
          hooks: {
            onFailure: (ctx) => {
              failureCalled = true
              failureCause = ctx.cause
              attemptsMade = ctx.attemptsMade
            },
          },
        })
        expect.fail('Should have thrown PollingError')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.failureCause).toBe(PollingFailureCause.CANCELLED)
        expect(pollingError.attemptsMade).toBe(0)
      }

      expect(failureCalled).toBe(true)
      expect(failureCause).toBe(PollingFailureCause.CANCELLED)
      expect(attemptsMade).toBe(0)
    })

    it('should call onFailure when signal is aborted between attempts', async () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelayMs: 0,
        maxDelayMs: 0,
        backoffMultiplier: 1,
        maxAttempts: 10,
        jitterFactor: 0,
      })

      const controller = new AbortController()
      let attemptCount = 0
      let failureCalled = false
      let failureCause: string | undefined
      let attemptsMade = 0

      try {
        await strategy.execute<string>(
          () => {
            attemptCount++
            // Abort after first attempt
            if (attemptCount === 1) {
              controller.abort()
            }
            return Promise.resolve({ isComplete: false })
          },
          {
            signal: controller.signal,
            hooks: {
              onFailure: (ctx) => {
                failureCalled = true
                failureCause = ctx.cause
                attemptsMade = ctx.attemptsMade
              },
            },
          },
        )
        expect.fail('Should have thrown PollingError')
      } catch (error) {
        expect(error).toBeInstanceOf(PollingError)
        const pollingError = error as PollingError
        expect(pollingError.failureCause).toBe(PollingFailureCause.CANCELLED)
        expect(pollingError.attemptsMade).toBe(1)
      }

      expect(failureCalled).toBe(true)
      expect(failureCause).toBe(PollingFailureCause.CANCELLED)
      expect(attemptsMade).toBe(1)
    })
  })
})
