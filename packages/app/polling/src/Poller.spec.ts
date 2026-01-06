import { describe, expect, it } from 'vitest'
import { Poller, type PollingOptions, type PollingStrategy, type PollResult } from './Poller.ts'
import { PollingError, PollingFailureCause } from './PollingError.ts'

describe('Poller', () => {
  describe('delegation to strategy', () => {
    it('should delegate to strategy and return result', async () => {
      // Create a simple strategy that succeeds immediately
      const simpleStrategy: PollingStrategy = {
        async execute<T>(
          pollFn: (attempt: number) => Promise<PollResult<T>>,
          _options: PollingOptions,
        ): Promise<T> {
          const result = await pollFn(1)
          if (result.isComplete) {
            return result.value
          }
          throw new Error('Should not reach here')
        },
      }

      const poller = new Poller(simpleStrategy)

      const result = await poller.poll<string>(
        async () => ({ isComplete: true, value: 'test-result' }),
        {},
      )

      expect(result).toBe('test-result')
    })

    it('should pass all parameters to strategy', async () => {
      let receivedPollFn: ((attempt: number) => Promise<PollResult<string>>) | null = null
      let receivedOptions: PollingOptions | null = null

      const capturingStrategy: PollingStrategy = {
        async execute<T>(
          pollFn: (attempt: number) => Promise<PollResult<T>>,
          options: PollingOptions,
        ): Promise<T> {
          receivedPollFn = pollFn as (attempt: number) => Promise<PollResult<string>>
          receivedOptions = options

          const result = await pollFn(1)
          if (result.isComplete) {
            return result.value
          }
          throw new Error('Should not reach here')
        },
      }

      const poller = new Poller(capturingStrategy)
      const metadata = { testId: 'test-123', userId: 'user-456' }
      const controller = new AbortController()

      await poller.poll<string>(async () => ({ isComplete: true, value: 'result' }), {
        metadata,
        signal: controller.signal,
      })

      expect(receivedPollFn).not.toBeNull()
      expect(receivedOptions).not.toBeNull()
      expect(receivedOptions!.metadata).toEqual(metadata)
      expect(receivedOptions!.signal).toBe(controller.signal)
    })

    it('should propagate errors from strategy', async () => {
      const failingStrategy: PollingStrategy = {
        execute<T>(): Promise<T> {
          return Promise.reject(
            new PollingError('Polling timeout after 5 attempts', PollingFailureCause.TIMEOUT, 5, {
              testId: 'error-test',
            }),
          )
        },
      }

      const poller = new Poller(failingStrategy)

      await expect(
        poller.poll<string>(async () => ({ isComplete: false }), {}),
      ).rejects.toMatchObject({
        name: 'PollingError',
        failureCause: PollingFailureCause.TIMEOUT,
        attemptsMade: 5,
      })
    })
  })

  describe('poll function behavior', () => {
    it('should work with different return types', async () => {
      const immediateStrategy: PollingStrategy = {
        async execute<T>(pollFn: (attempt: number) => Promise<PollResult<T>>): Promise<T> {
          const result = await pollFn(1)
          if (result.isComplete) {
            return result.value
          }
          throw new Error('Incomplete')
        },
      }

      const poller = new Poller(immediateStrategy)

      // String result
      const stringResult = await poller.poll<string>(
        async () => ({ isComplete: true, value: 'hello' }),
        {},
      )
      expect(stringResult).toBe('hello')

      // Number result
      const numberResult = await poller.poll<number>(
        async () => ({ isComplete: true, value: 42 }),
        {},
      )
      expect(numberResult).toBe(42)

      // Object result
      const objectResult = await poller.poll<{ id: string; status: string }>(
        async () => ({
          isComplete: true,
          value: { id: 'test-id', status: 'done' },
        }),
        {},
      )
      expect(objectResult).toEqual({ id: 'test-id', status: 'done' })

      // Array result
      const arrayResult = await poller.poll<number[]>(
        async () => ({ isComplete: true, value: [1, 2, 3] }),
        {},
      )
      expect(arrayResult).toEqual([1, 2, 3])
    })

    it('should handle pollFn that uses attempt number', async () => {
      const attemptAwareStrategy: PollingStrategy = {
        async execute<T>(pollFn: (attempt: number) => Promise<PollResult<T>>): Promise<T> {
          for (let attempt = 1; attempt <= 3; attempt++) {
            const result = await pollFn(attempt)
            if (result.isComplete) {
              return result.value
            }
          }
          throw new Error('Max attempts')
        },
      }

      const poller = new Poller(attemptAwareStrategy)
      const attempts: number[] = []

      const result = await poller.poll<string>((attempt) => {
        attempts.push(attempt)
        if (attempt === 3) {
          return Promise.resolve({ isComplete: true, value: `completed-at-${attempt}` })
        }
        return Promise.resolve({ isComplete: false })
      }, {})

      expect(result).toBe('completed-at-3')
      expect(attempts).toEqual([1, 2, 3])
    })
  })

  describe('integration scenarios', () => {
    it('should work with retry logic in strategy', async () => {
      // Simple retry strategy that tries 3 times
      const retryStrategy: PollingStrategy = {
        async execute<T>(
          pollFn: (attempt: number) => Promise<PollResult<T>>,
          options: PollingOptions,
        ): Promise<T> {
          for (let attempt = 1; attempt <= 3; attempt++) {
            const result = await pollFn(attempt)
            if (result.isComplete) {
              return result.value
            }
          }
          throw new PollingError(
            'Polling timeout after 3 attempts',
            PollingFailureCause.TIMEOUT,
            3,
            options.metadata,
          )
        },
      }

      const poller = new Poller(retryStrategy)

      // Success case
      const successResult = await poller.poll<string>((attempt) => {
        if (attempt === 2) {
          return Promise.resolve({ isComplete: true, value: 'success' })
        }
        return Promise.resolve({ isComplete: false })
      }, {})
      expect(successResult).toBe('success')

      // Timeout case
      await expect(
        poller.poll<string>(async () => ({ isComplete: false }), {
          metadata: { jobId: 'timeout-job' },
        }),
      ).rejects.toMatchObject({
        failureCause: PollingFailureCause.TIMEOUT,
        details: { jobId: 'timeout-job' },
      })
    })

    it('should support cancellation through strategy', async () => {
      // Helper to check for cancellation
      const checkCancellation = (
        signal: AbortSignal | undefined,
        attemptsMade: number,
        metadata?: Record<string, unknown>,
      ) => {
        if (signal?.aborted) {
          throw new PollingError(
            `Polling cancelled after ${attemptsMade} attempts`,
            PollingFailureCause.CANCELLED,
            attemptsMade,
            metadata,
          )
        }
      }

      const cancellableStrategy: PollingStrategy = {
        async execute<T>(
          pollFn: (attempt: number) => Promise<PollResult<T>>,
          options: PollingOptions,
        ): Promise<T> {
          const { metadata, signal } = options
          checkCancellation(signal, 0, metadata)

          for (let attempt = 1; attempt <= 5; attempt++) {
            checkCancellation(signal, attempt - 1, metadata)

            const result = await pollFn(attempt)
            if (result.isComplete) {
              return result.value
            }
          }

          throw new PollingError(
            'Polling timeout after 5 attempts',
            PollingFailureCause.TIMEOUT,
            5,
            metadata,
          )
        },
      }

      const poller = new Poller(cancellableStrategy)

      // Pre-cancelled signal
      const controller1 = new AbortController()
      controller1.abort()

      await expect(
        poller.poll<string>(async () => ({ isComplete: false }), {
          metadata: { test: 'pre-cancelled' },
          signal: controller1.signal,
        }),
      ).rejects.toMatchObject({
        failureCause: PollingFailureCause.CANCELLED,
        attemptsMade: 0,
      })
    })

    it('should work with domain-specific errors', async () => {
      const errorPassthroughStrategy: PollingStrategy = {
        async execute<T>(pollFn: (attempt: number) => Promise<PollResult<T>>): Promise<T> {
          // Strategy just calls pollFn once and lets errors propagate
          const result = await pollFn(1)
          if (result.isComplete) {
            return result.value
          }
          throw new Error('Not complete')
        },
      }

      const poller = new Poller(errorPassthroughStrategy)

      class DomainError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'DomainError'
        }
      }

      await expect(
        poller.poll<string>(() => {
          throw new DomainError('Business logic failure')
        }, {}),
      ).rejects.toThrow(DomainError)
    })
  })
})
