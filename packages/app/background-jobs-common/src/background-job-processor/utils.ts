import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions } from 'bullmq'
import { Redis } from 'ioredis'
import { DEFAULT_JOB_CONFIG, QUEUE_GROUP_DELIMITER } from './constants.ts'
import type { BackgroundJobProcessorConfig } from './processors/types.ts'
import type { SafeJob } from './types.ts'
import type {QueueConfiguration} from "./managers/index.ts";

export const daysToSeconds = (days: number): number => days * 24 * 60 * 60

export const daysToMilliseconds = (days: number): number => daysToSeconds(days) * 1000

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

export const resolveJobId = (job?: SafeJob<unknown>): string => job?.id ?? 'unknown'

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

export const resolveQueueId = (
  queueConfig: Pick<
    BackgroundJobProcessorConfig | QueueConfiguration,
    'queueId' | 'bullDashboardGrouping'
  >
): string =>
  [...(queueConfig.bullDashboardGrouping ?? []), queueConfig.queueId].join(QUEUE_GROUP_DELIMITER)
