import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import { isError } from '@lokalise/node-core'
import type { JobsOptions } from 'bullmq'
import Redis from 'ioredis'
import { DEFAULT_JOB_CONFIG } from './constants'
import type { SafeJob } from './types'

export const daysToSeconds = (days: number): number => days * 24 * 60 * 60

export const daysToMilliseconds = (days: number): number => daysToSeconds(days) * 1000

export const resolveJobId = (job?: SafeJob<unknown>): string => job?.id ?? 'unknown'

export const isUnrecoverableJobError = (error: Error): boolean =>
  error.name === 'UnrecoverableError'

export const isStalledJobError = (error: Error): boolean =>
  error.message === 'job stalled more than allowable limit'

export const sanitizeRedisConfig = (config: RedisConfig): RedisConfig => {
  return {
    ...config,
    keyPrefix: undefined,
    maxRetriesPerRequest: null, // Has to be null for compatibility with BullMQ, see: https://docs.bullmq.io/bull/patterns/persistent-connections#workers
  }
}

export const createSanitizedRedisClient = (redisConfig: RedisConfig): Redis =>
  new Redis(sanitizeRedisConfig(redisConfig))

export const isRedisClient = (redis: RedisConfig | Redis): redis is Redis => 'options' in redis

export const prepareJobOptions = <JobOptionsType extends JobsOptions>(
  isTest: boolean,
  options?: JobOptionsType,
): JobOptionsType => {
  const preparedOptions: JobOptionsType = {
    jobId: generateMonotonicUuid(),
    ...DEFAULT_JOB_CONFIG,
    ...(options ?? ({} as JobOptionsType)),
  }

  if (isTest) {
    preparedOptions.delay = 0
    preparedOptions.backoff = { delay: 0, type: 'fixed' }
    preparedOptions.removeOnFail = true
    if (preparedOptions.removeOnComplete === undefined) preparedOptions.removeOnComplete = true
  }

  return preparedOptions
}

export const isJobMissingError = (error: unknown): boolean =>
  isError(error) && error.message.startsWith('Missing key for job')
