import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions } from 'bullmq'
import type Redis from 'ioredis'
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
  return { ...config, keyPrefix: undefined }
}

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

  if (isTest && typeof preparedOptions.backoff === 'object') {
    preparedOptions.backoff.delay = 1 // zero delay is handled weirdly in BullMQ for concurrent job.
    preparedOptions.backoff.type = 'fixed'
    preparedOptions.removeOnFail = true
    if (preparedOptions.removeOnComplete === undefined) {
      preparedOptions.removeOnComplete = true
    }
  }

  return preparedOptions
}
