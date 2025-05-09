import type { QueueOptions, WorkerOptions } from 'bullmq'

/**
 * How many days we retain completed jobs
 */
export const RETENTION_COMPLETED_JOBS_IN_AMOUNT = 50

/**
 * How many days we retain completed jobs
 */
export const RETENTION_COMPLETED_JOBS_IN_DAYS = 3

/**
 * How many days we retain failed jobs
 */
export const RETENTION_FAILED_JOBS_IN_DAYS = 7

/**
 * How many days we retain queue ids
 */
export const RETENTION_QUEUE_IDS_IN_DAYS = 14

export const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

export const DEFAULT_QUEUE_OPTIONS = {
  streams: { events: { maxLen: 0 } },
} as const satisfies Omit<QueueOptions, 'connection' | 'prefix'>

export const DEFAULT_WORKER_OPTIONS = {
  concurrency: 10,
  maxStalledCount: 3, // same as default attempts by default
  ttl: 60,
} as const satisfies Omit<WorkerOptions, 'connection' | 'prefix' | 'autorun'> & {
  ttl: number
}
