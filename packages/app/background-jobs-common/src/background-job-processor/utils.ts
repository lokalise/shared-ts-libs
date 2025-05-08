import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import { DEFAULT_JOB_CONFIG } from './constants.ts'
import type { QueueConfiguration } from './managers/index.ts'
import type { BackgroundJobProcessorConfig } from './processors/types.ts'
import { QUEUE_GROUP_DELIMITER } from './public-utils/index.ts'
import type { SafeJob } from './types.ts'

export const daysToSeconds = (days: number): number => days * 24 * 60 * 60

export const daysToMilliseconds = (days: number): number => daysToSeconds(days) * 1000

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
  >,
): string =>
  [...(queueConfig.bullDashboardGrouping ?? []), queueConfig.queueId].join(QUEUE_GROUP_DELIMITER)
