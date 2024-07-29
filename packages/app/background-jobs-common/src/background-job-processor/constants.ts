import type { JobsOptions, WorkerOptions } from 'bullmq'

import { daysToSeconds } from './utils'

/**
 * How many days we retain completed jobs
 */
export const RETENTION_COMPLETED_JOBS_IN_AMOUNT = 50

/**
 * How many days we retain failed jobs
 */
export const RETENTION_FAILED_JOBS_IN_DAYS = 7

/**
 * How many days we retain queue ids
 */
export const RETENTION_QUEUE_IDS_IN_DAYS = 14

/**
 * Default config
 *    - Retry config: 3 retries with 30s of total amount of wait time between retries using
 *            exponential strategy https://docs.bullmq.io/guide/retrying-failing-jobs#built-in-backoff-strategies
 *    - Job retention: 50 last completed jobs, 7 days for failed jobs
 */
export const DEFAULT_JOB_CONFIG: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: { count: RETENTION_COMPLETED_JOBS_IN_AMOUNT },
  removeOnFail: {
    age: daysToSeconds(RETENTION_FAILED_JOBS_IN_DAYS),
  },
}

export const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

export const DEFAULT_WORKER_OPTIONS = {
  concurrency: 10,
  maxStalledCount: 3, // same as default attempts by default
  ttl: 60,
} as const satisfies Omit<WorkerOptions, 'connection'> & { ttl: number }
