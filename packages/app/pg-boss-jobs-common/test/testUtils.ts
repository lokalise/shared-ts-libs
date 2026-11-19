import type { TransactionObservabilityManager } from '@lokalise/node-core'
import pino from 'pino'
import { vi } from 'vitest'
import { PgBossQueueManager } from '../src/queues/PgBossQueueManager.ts'
import type { PgBossQueueManagerConfig, QueueConfiguration } from '../src/queues/types.ts'

export const getTestPgBossOptions = (): PgBossQueueManagerConfig['pgBossOptions'] => ({
  connectionString: process.env.DATABASE_URL,
  schema: process.env.PGBOSS_SCHEMA,
  // Maintenance and cron loops only add noise and open connections to a test run.
  supervise: false,
  schedule: false,
})

export const buildTestQueueManager = <const Queues extends readonly QueueConfiguration[]>(
  queues: Queues,
  config: Partial<PgBossQueueManagerConfig> = {},
): PgBossQueueManager<Queues> =>
  new PgBossQueueManager(queues, {
    isTest: true,
    pgBossOptions: getTestPgBossOptions(),
    ...config,
  })

export const buildFakeTransactionObservabilityManager = () =>
  ({
    start: vi.fn(),
    startWithGroup: vi.fn(),
    stop: vi.fn(),
    addCustomAttributes: vi.fn(),
  }) satisfies TransactionObservabilityManager

export const silentLogger = pino({ level: 'silent' })

/** Reads a job row directly: the spy has no view of persisted columns such as `output`. */
export const getPersistedJob = async (
  manager: PgBossQueueManager<readonly QueueConfiguration[]>,
  queueId: string,
  jobId: string,
) => manager.boss.getJobById(queueId, jobId)

/**
 * Polls the job row until it reaches `state`. Use it for a final `failed`: the spy reports `failed`
 * after every failed attempt, including one pg-boss is about to retry.
 */
export const waitForJobState = async (
  manager: PgBossQueueManager<readonly QueueConfiguration[]>,
  queueId: string,
  jobId: string,
  state: 'completed' | 'failed',
  timeoutMs = 10_000,
) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const job = await getPersistedJob(manager, queueId, jobId)
    if (job?.state === state) return job
    if (Date.now() > deadline) {
      throw new Error(`Job ${jobId} did not reach "${state}" (last state: ${job?.state})`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
