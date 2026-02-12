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
      const controller = new AbortController()

      await poller.poll<string>(async () => ({ isComplete: true, value: 'result' }), {
        signal: controller.signal,
      })

      expect(receivedPollFn).not.toBeNull()
      expect(receivedOptions).not.toBeNull()
      expect(receivedOptions!.signal).toBe(controller.signal)
    })

    it('should propagate errors from strategy', async () => {
      const failingStrategy: PollingStrategy = {
        execute<T>(): Promise<T> {
          return Promise.reject(
            new PollingError('Polling timeout after 5 attempts', PollingFailureCause.TIMEOUT, 5),
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
          _options: PollingOptions,
        ): Promise<T> {
          for (let attempt = 1; attempt <= 3; attempt++) {
            const result = await pollFn(attempt)
            if (result.isComplete) {
              return result.value
            }
          }
          throw new PollingError('Polling timeout after 3 attempts', PollingFailureCause.TIMEOUT, 3)
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
        poller.poll<string>(async () => ({ isComplete: false }), {}),
      ).rejects.toMatchObject({
        failureCause: PollingFailureCause.TIMEOUT,
      })
    })

    it('should support cancellation through strategy', async () => {
      // Helper to check for cancellation
      const checkCancellation = (signal: AbortSignal | undefined, attemptsMade: number) => {
        if (signal?.aborted) {
          throw new PollingError(
            `Polling cancelled after ${attemptsMade} attempts`,
            PollingFailureCause.CANCELLED,
            attemptsMade,
          )
        }
      }

      const cancellableStrategy: PollingStrategy = {
        async execute<T>(
          pollFn: (attempt: number) => Promise<PollResult<T>>,
          options: PollingOptions,
        ): Promise<T> {
          const { signal } = options
          checkCancellation(signal, 0)

          for (let attempt = 1; attempt <= 5; attempt++) {
            checkCancellation(signal, attempt - 1)

            const result = await pollFn(attempt)
            if (result.isComplete) {
              return result.value
            }
          }

          throw new PollingError('Polling timeout after 5 attempts', PollingFailureCause.TIMEOUT, 5)
        },
      }

      const poller = new Poller(cancellableStrategy)

      // Pre-cancelled signal
      const controller1 = new AbortController()
      controller1.abort()

      await expect(
        poller.poll<string>(async () => ({ isComplete: false }), {
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

  describe('hooks', () => {
    describe('onAttempt hook', () => {
      it('should call onAttempt hook after each polling attempt', async () => {
        const hookCalls: Array<{ attempt: number; isComplete: boolean }> = []

        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            for (let attempt = 1; attempt <= 3; attempt++) {
              const result = await pollFn(attempt)

              options.hooks?.onAttempt?.({
                attempt,
                isComplete: result.isComplete,
              })

              if (result.isComplete) {
                return result.value
              }
            }
            throw new Error('Max attempts')
          },
        }

        const poller = new Poller(strategy)

        await poller.poll<string>(
          (attempt) => {
            if (attempt === 3) {
              return Promise.resolve({ isComplete: true, value: 'success' })
            }
            return Promise.resolve({ isComplete: false })
          },
          {
            hooks: {
              onAttempt: (ctx) => {
                hookCalls.push({ attempt: ctx.attempt, isComplete: ctx.isComplete })
              },
            },
          },
        )

        expect(hookCalls).toEqual([
          { attempt: 1, isComplete: false },
          { attempt: 2, isComplete: false },
          { attempt: 3, isComplete: true },
        ])
      })

      it('should work with hooks capturing context via closures', async () => {
        const jobId = 'job-123'
        const userId = 'user-456'
        let capturedContext: { jobId: string; userId: string; attempt: number } | undefined

        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            const result = await pollFn(1)
            options.hooks?.onAttempt?.({
              attempt: 1,
              isComplete: result.isComplete,
            })
            if (result.isComplete) {
              return result.value
            }
            throw new Error('Not complete')
          },
        }

        const poller = new Poller(strategy)

        await poller.poll<string>(async () => ({ isComplete: true, value: 'success' }), {
          hooks: {
            onAttempt: ({ attempt }) => {
              // Capture context from closure
              capturedContext = { jobId, userId, attempt }
            },
          },
        })

        expect(capturedContext).toEqual({ jobId: 'job-123', userId: 'user-456', attempt: 1 })
      })
    })

    describe('onWait hook', () => {
      it('should call onWait hook before delays', async () => {
        const hookCalls: Array<{ attempt: number; waitMs: number }> = []

        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            for (let attempt = 1; attempt <= 3; attempt++) {
              const result = await pollFn(attempt)
              if (result.isComplete) {
                return result.value
              }

              // Simulate delay with onWait hook
              const waitMs = attempt * 100
              options.hooks?.onWait?.({
                attempt,
                waitMs,
              })
            }
            throw new Error('Max attempts')
          },
        }

        const poller = new Poller(strategy)

        await poller.poll<string>(
          (attempt) => {
            if (attempt === 3) {
              return Promise.resolve({ isComplete: true, value: 'success' })
            }
            return Promise.resolve({ isComplete: false })
          },
          {
            hooks: {
              onWait: (ctx) => {
                hookCalls.push({ attempt: ctx.attempt, waitMs: ctx.waitMs })
              },
            },
          },
        )

        expect(hookCalls).toEqual([
          { attempt: 1, waitMs: 100 },
          { attempt: 2, waitMs: 200 },
        ])
      })
    })

    describe('onSuccess hook', () => {
      it('should call onSuccess hook when polling completes', async () => {
        let successCalled = false
        let totalAttempts = 0

        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            for (let attempt = 1; attempt <= 5; attempt++) {
              const result = await pollFn(attempt)
              if (result.isComplete) {
                options.hooks?.onSuccess?.({
                  totalAttempts: attempt,
                })
                return result.value
              }
            }
            throw new Error('Max attempts')
          },
        }

        const poller = new Poller(strategy)

        await poller.poll<string>(
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

      it('should not call onSuccess when polling fails', async () => {
        let successCalled = false

        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            for (let attempt = 1; attempt <= 3; attempt++) {
              const result = await pollFn(attempt)
              if (result.isComplete) {
                options.hooks?.onSuccess?.({
                  totalAttempts: attempt,
                })
                return result.value
              }
            }
            throw new PollingError('Timeout', PollingFailureCause.TIMEOUT, 3)
          },
        }

        const poller = new Poller(strategy)

        await expect(
          poller.poll<string>(async () => ({ isComplete: false }), {
            hooks: {
              onSuccess: () => {
                successCalled = true
              },
            },
          }),
        ).rejects.toThrow(PollingError)

        expect(successCalled).toBe(false)
      })
    })

    describe('onFailure hook', () => {
      it('should call onFailure hook on timeout', async () => {
        let failureCalled = false
        let failureCause: string | undefined
        let attemptsMade = 0

        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            const maxAttempts = 3
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              const result = await pollFn(attempt)
              if (result.isComplete) {
                return result.value
              }
            }

            options.hooks?.onFailure?.({
              cause: PollingFailureCause.TIMEOUT,
              attemptsMade: maxAttempts,
            })

            throw new PollingError('Timeout', PollingFailureCause.TIMEOUT, maxAttempts)
          },
        }

        const poller = new Poller(strategy)

        await expect(
          poller.poll<string>(async () => ({ isComplete: false }), {
            hooks: {
              onFailure: (ctx) => {
                failureCalled = true
                failureCause = ctx.cause
                attemptsMade = ctx.attemptsMade
              },
            },
          }),
        ).rejects.toThrow(PollingError)

        expect(failureCalled).toBe(true)
        expect(failureCause).toBe(PollingFailureCause.TIMEOUT)
        expect(attemptsMade).toBe(3)
      })

      it('should call onFailure hook on cancellation', async () => {
        let failureCalled = false
        let failureCause: string | undefined

        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            if (options.signal?.aborted) {
              options.hooks?.onFailure?.({
                cause: PollingFailureCause.CANCELLED,
                attemptsMade: 0,
              })
              throw new PollingError('Cancelled', PollingFailureCause.CANCELLED, 0)
            }

            const result = await pollFn(1)
            if (result.isComplete) {
              return result.value
            }
            throw new Error('Not complete')
          },
        }

        const poller = new Poller(strategy)
        const controller = new AbortController()
        controller.abort()

        await expect(
          poller.poll<string>(async () => ({ isComplete: false }), {
            signal: controller.signal,
            hooks: {
              onFailure: (ctx) => {
                failureCalled = true
                failureCause = ctx.cause
              },
            },
          }),
        ).rejects.toThrow(PollingError)

        expect(failureCalled).toBe(true)
        expect(failureCause).toBe(PollingFailureCause.CANCELLED)
      })
    })

    describe('multiple hooks', () => {
      it('should call all hooks in correct order', async () => {
        const events: string[] = []

        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            for (let attempt = 1; attempt <= 2; attempt++) {
              const result = await pollFn(attempt)

              options.hooks?.onAttempt?.({
                attempt,
                isComplete: result.isComplete,
              })

              if (result.isComplete) {
                options.hooks?.onSuccess?.({
                  totalAttempts: attempt,
                })
                return result.value
              }

              options.hooks?.onWait?.({
                attempt,
                waitMs: 100,
              })
            }
            throw new Error('Max attempts')
          },
        }

        const poller = new Poller(strategy)

        await poller.poll<string>(
          (attempt) => {
            if (attempt === 2) {
              return Promise.resolve({ isComplete: true, value: 'success' })
            }
            return Promise.resolve({ isComplete: false })
          },
          {
            hooks: {
              onAttempt: ({ attempt }) => events.push(`attempt-${attempt}`),
              onWait: ({ attempt }) => events.push(`wait-${attempt}`),
              onSuccess: () => events.push('success'),
              onFailure: () => events.push('failure'),
            },
          },
        )

        expect(events).toEqual(['attempt-1', 'wait-1', 'attempt-2', 'success'])
      })
    })

    describe('optional hooks', () => {
      it('should work without any hooks provided', async () => {
        const strategy: PollingStrategy = {
          async execute<T>(
            pollFn: (attempt: number) => Promise<PollResult<T>>,
            options: PollingOptions,
          ): Promise<T> {
            const result = await pollFn(1)
            options.hooks?.onAttempt?.({ attempt: 1, isComplete: result.isComplete })
            if (result.isComplete) {
              return result.value
            }
            throw new Error('Not complete')
          },
        }

        const poller = new Poller(strategy)

        const result = await poller.poll<string>(
          async () => ({ isComplete: true, value: 'success' }),
          {},
        )

        expect(result).toBe('success')
      })

      it('should work with undefined options', async () => {
        const strategy: PollingStrategy = {
          async execute<T>(pollFn: (attempt: number) => Promise<PollResult<T>>): Promise<T> {
            const result = await pollFn(1)
            if (result.isComplete) {
              return result.value
            }
            throw new Error('Not complete')
          },
        }

        const poller = new Poller(strategy)

        const result = await poller.poll<string>(async () => ({
          isComplete: true,
          value: 'success',
        }))

        expect(result).toBe('success')
      })
    })
  })
})
