import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import { isError } from '@lokalise/node-core'
import type { JobsOptions } from 'bullmq'
import { Redis } from 'ioredis'
import { DEFAULT_JOB_CONFIG } from './constants.js'
import type { SafeJob } from './types.js'
import { MUTED_UNRECOVERABLE_ERROR_SYMBOL } from '../errors/MutedUnrecoverableError.js'

export const daysToSeconds = (days: number): number => days * 24 * 60 * 60

export const daysToMilliseconds = (days: number): number => daysToSeconds(days) * 1000

export const resolveJobId = (job?: SafeJob<unknown>): string => job?.id ?? 'unknown'

export const isUnrecoverableJobError = (error: Error): boolean =>
  error.name === 'UnrecoverableError'

export const isMutedUnrecoverableJobError = (error: Error): boolean =>
    // biome-ignore lint/suspicious/noExplicitAny: checking for existence of prop outside or Error interface
    isUnrecoverableJobError(error) && (error as any)[MUTED_UNRECOVERABLE_ERROR_SYMBOL] === true

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
    preparedOptions.backoff = { delay: 1, type: 'fixed' } // Bullmq behaves weirdly with backoff 0
  }

  return preparedOptions
}

export const isJobMissingError = (error: unknown): boolean =>
  isError(error) && error.message.startsWith('Missing key for job')
