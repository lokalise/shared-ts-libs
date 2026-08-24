import type { JobType, QueueOptions, WorkerOptions } from 'bullmq'

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

/**
 * Job types counted as "pending" work in a queue.
 *
 * BullMQ v5 parks jobs of a paused queue in a separate `paused` list, while v6
 * pauses through queue metadata and leaves them in `waiting` (and dropped
 * `paused` from `JobType`). Asking v6 for the `paused` count reads a key that is
 * never written and returns 0, so the same list is correct on both majors.
 */
export const PENDING_JOB_TYPES = [
  'active',
  'waiting',
  'paused',
  'delayed',
  'prioritized',
  'waiting-children',
] as JobType[]
