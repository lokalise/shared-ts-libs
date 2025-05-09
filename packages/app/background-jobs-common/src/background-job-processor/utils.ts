import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import {
  RETENTION_COMPLETED_JOBS_IN_AMOUNT,
  RETENTION_COMPLETED_JOBS_IN_DAYS,
  RETENTION_FAILED_JOBS_IN_DAYS,
} from './constants.ts'
import type { QueueConfiguration } from './managers/index.ts'
import type { BackgroundJobProcessorConfig } from './processors/types.ts'
import { QUEUE_GROUP_DELIMITER } from './public-utils/index.ts'
import type { SafeJob } from './types.ts'

const daysToSeconds = (days: number): number => days * 24 * 60 * 60

export const daysToMilliseconds = (days: number): number => daysToSeconds(days) * 1000

export const isRedisClient = (redis: RedisConfig | Redis): redis is Redis => 'options' in redis

export const resolveJobId = (job?: SafeJob<unknown>): string => job?.id ?? 'unknown'

/**
 * Default config
 *    - Retry config: 3 retries with 30s of total amount of wait time between retries using
 *            exponential strategy https://docs.bullmq.io/guide/retrying-failing-jobs#built-in-backoff-strategies
 *    - Job retention: 50 last completed jobs, 7 days for failed jobs
 */
const DEFAULT_JOB_CONFIG: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: {
    count: RETENTION_COMPLETED_JOBS_IN_AMOUNT,
    age: daysToSeconds(RETENTION_COMPLETED_JOBS_IN_DAYS),
  },
  removeOnFail: { age: daysToSeconds(RETENTION_FAILED_JOBS_IN_DAYS) },
}

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
