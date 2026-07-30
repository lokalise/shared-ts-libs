import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import { describe, expect, it } from 'vitest'
import type { SafeJob } from './types.ts'
import {
  daysToMilliseconds,
  isJobRemovedOnComplete,
  isRedisClient,
  prepareJobOptions,
  resolveJobId,
  resolveQueueId,
} from './utils.ts'

describe('utils', () => {
  describe('daysToMilliseconds', () => {
    it.each<[number, number]>([
      [0, 0],
      [1, 86_400_000],
      [7, 604_800_000],
    ])('converts %i days to %i ms', (days, expected) => {
      expect(daysToMilliseconds(days)).toBe(expected)
    })
  })

  describe('isRedisClient', () => {
    it('returns true when the value is a Redis client', () => {
      expect(isRedisClient({ options: {} } as unknown as Redis)).toBe(true)
    })

    it('returns false when the value is a RedisConfig', () => {
      expect(isRedisClient({ host: 'localhost', port: 6379 } as RedisConfig)).toBe(false)
    })
  })

  describe('resolveJobId', () => {
    it.each<[SafeJob<unknown> | undefined, string]>([
      [undefined, 'unknown'],
      [{ id: 'job-123' } as SafeJob<unknown>, 'job-123'],
      [{} as SafeJob<unknown>, 'unknown'],
    ])('resolves %o to %s', (job, expected) => {
      expect(resolveJobId(job)).toBe(expected)
    })
  })

  describe('prepareJobOptions', () => {
    it('applies the default job config and a generated jobId', () => {
      const options = prepareJobOptions(false)

      expect(options.jobId).toEqual(expect.any(String))
      expect(options).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 50, age: 259_200 },
        removeOnFail: { age: 604_800 },
      })
    })

    it('lets caller options override the defaults', () => {
      const options = prepareJobOptions(false, { attempts: 5, removeOnComplete: true })

      expect(options.attempts).toBe(5)
      expect(options.removeOnComplete).toBe(true)
    })

    it('forces deterministic delay and backoff in test mode', () => {
      const options = prepareJobOptions(true)

      expect(options.delay).toBe(0)
      expect(options.backoff).toEqual({ delay: 1, type: 'fixed' })
    })
  })

  describe('resolveQueueId', () => {
    it('returns the queueId when there is no dashboard grouping', () => {
      expect(resolveQueueId({ queueId: 'my-queue' })).toBe('my-queue')
    })

    it('prefixes the queueId with the dashboard grouping', () => {
      expect(
        resolveQueueId({ queueId: 'my-queue', bullDashboardGrouping: ['prefix1', 'prefix2'] }),
      ).toBe('prefix1.prefix2.my-queue')
    })
  })

  describe('isJobRemovedOnComplete', () => {
    it.each<[JobsOptions['removeOnComplete'], boolean]>([
      [true, true],
      [0, true],
      [1, true],
      [{ count: 0 }, true],
      [{ count: 0, age: 3600 }, true],
      [false, false],
      [undefined, false],
      [2, false],
      [{ count: 1 }, false],
      [{ age: 3600 }, false],
    ])('returns %o -> %s', (removeOnComplete, expected) => {
      expect(isJobRemovedOnComplete(removeOnComplete)).toBe(expected)
    })
  })
})
