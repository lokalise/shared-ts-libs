import { setTimeout } from 'node:timers/promises'
import type { ErrorReport, ErrorReporter } from '@lokalise/node-core'
import type { Redis } from 'ioredis'
import { ToadScheduler } from 'toad-scheduler'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRedisClient, getTestRedisConfig } from '../../test/TestRedis.ts'
import { FakePeriodicJob } from '../../test/fakes/FakePeriodicJob.ts'
import type { JobExecutionContext } from './periodicJobTypes.ts'

describe('AbstractPeriodicJob', () => {
  let redis: Redis
  let scheduler: ToadScheduler

  beforeAll(() => {
    redis = createRedisClient(getTestRedisConfig())
  })
  beforeEach(async () => {
    await redis.flushall('SYNC')
    scheduler = new ToadScheduler()
  })

  afterEach(() => {
    scheduler.stop()
  })
  afterAll(async () => {
    await redis.quit()
  })

  it('should throw an error when single producer mode is enabled without redis instance', () => {
    expect(
      () =>
        new FakePeriodicJob(
          () => Promise.resolve(),
          {
            scheduler,
          },
          {
            schedule: {
              intervalInMs: 1000,
            },
            singleConsumerMode: {
              enabled: true,
              exclusiveLockSuffix: 'suff',
            },
          },
        ),
    ).toThrow(/Redis instance must be provided/)
  })

  it('should run processing multiple times', async () => {
    const executionIds: string[] = []
    const processMock = (executionContext: JobExecutionContext) => {
      executionIds.push(executionContext.executorId)
      return Promise.resolve()
    }
    const job = new FakePeriodicJob(processMock, {
      scheduler,
    })
    job.register()

    await vi.waitUntil(() => executionIds.length === 3)
    expect(executionIds).toMatchObject([expect.any(String), expect.any(String), expect.any(String)])

    await job.dispose()
  })

  it('should await first processing when using asyncRegister', async () => {
    let counter = 0
    const processMock = async () => {
      await setTimeout(100)
      counter++
      return Promise.resolve()
    }
    const job = new FakePeriodicJob(processMock, {
      scheduler,
    })
    await job.asyncRegister()
    expect(counter).toBe(1)
    await job.dispose()
  })

  it('should run processing when using cron expression', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 6, 6, 0, 0, 0))

    const executionIds: string[] = []
    const processMock = (executionContext: JobExecutionContext) => {
      executionIds.push(executionContext.executorId)
      return Promise.resolve()
    }
    const job = new FakePeriodicJob(
      processMock,
      {
        scheduler,
      },
      {
        schedule: {
          cron: {
            cronExpression: '*/2 * * * * *',
          },
        },
      },
    )
    job.register()

    vi.advanceTimersByTime(50)
    await Promise.resolve()
    expect(executionIds).toHaveLength(0)

    vi.advanceTimersByTime(500)
    await Promise.resolve()

    expect(executionIds).toHaveLength(0)

    vi.advanceTimersByTime(1500)
    await Promise.resolve()

    expect(executionIds).toHaveLength(1)

    await job.dispose()

    // ToDo implement tests for multiple processings
    vi.useRealTimers()
  })

  it('handles errors', async () => {
    const errors: ErrorReport[] = []
    const errorReporter: ErrorReporter = {
      report(errorReport: ErrorReport): void {
        errors.push(errorReport)
      },
    }

    const job1 = new FakePeriodicJob(
      () => {
        throw new Error('I broke')
      },
      {
        redis,
        scheduler,
        errorReporter,
      },
      {
        schedule: {
          intervalInMs: 50,
        },
        singleConsumerMode: {
          enabled: true,
          lockTimeout: 60,
          lockTimeoutAfterSuccess: 100,
        },
      },
    )

    job1.register()

    await vi.waitUntil(() => errors.length > 0)
    expect(errors[0]!.error.message).toBe('I broke')
  })

  it('should run exclusively if executionLock = enabled', async () => {
    const executedCounts: Record<string, number> = {
      job1: 0,
      job2: 0,
    }

    const createProcessFn = (id: 'job1' | 'job2') => () => {
      executedCounts[id]!++
      return Promise.resolve()
    }

    // This job should run exclusively and execute at all intervals
    const job1 = new FakePeriodicJob(
      createProcessFn('job1'),
      {
        redis,
        scheduler,
      },
      {
        schedule: {
          intervalInMs: 50,
        },
        singleConsumerMode: {
          enabled: true,
          lockTimeout: 60,
          lockTimeoutAfterSuccess: 100,
        },
      },
    )

    const anotherScheduler = new ToadScheduler()
    // This job is scheduled later and should skip all executions because job1 is running
    const job2 = new FakePeriodicJob(
      createProcessFn('job2'),
      {
        redis,
        scheduler: anotherScheduler,
      },
      {
        schedule: {
          intervalInMs: 20,
        },
        singleConsumerMode: {
          enabled: true,
          lockTimeout: 60,
          lockTimeoutAfterSuccess: 20,
        },
      },
    )

    // Run job1
    job1.register()
    await vi.waitUntil(() => executedCounts.job1! > 0)
    expect(executedCounts.job1 === 1)

    // Register job2, but it should skip executions due to a lock
    job2.register()
    await vi.waitUntil(() => executedCounts.job1! > 2)
    expect(executedCounts.job1 === 3)

    expect(executedCounts.job2).toBe(0)

    // Stop job1 and let job2 run
    await job1.dispose()
    await vi.waitUntil(() => executedCounts.job2! > 0, {
      interval: 5,
      timeout: 500,
    })
    expect(executedCounts.job2).toBe(1)
    await job2.dispose()

    anotherScheduler.stop()
  })
})
