import type {
  CommonLogger,
  ErrorReporter,
  TransactionObservabilityManager,
} from '@lokalise/node-core'
import type { JobWithMetadata, WorkOptions } from 'pg-boss'
import type { PgBossQueueManager } from '../queues/PgBossQueueManager.ts'
import type { QueueConfiguration } from '../queues/types.ts'

/** A job as a processor receives it: payload plus pg-boss's metadata (retry count, timestamps, ...). */
export type PgBossJob<Payload> = JobWithMetadata<Payload>

/**
 * The pg-boss `work` options a processor may set. `includeMetadata` and `perJobResults` belong to
 * the base class. `transactional` is left out because pg-boss rejects it together with
 * `perJobResults`, so asking for it fails to compile instead of failing at boot.
 */
export type PgBossWorkerOptions = Omit<
  WorkOptions,
  'includeMetadata' | 'perJobResults' | 'transactional' | 'transactionTimeoutSeconds'
>

export type PgBossJobProcessorConfig<QueueId extends string> = {
  queueId: QueueId
  /** Name of a webservice or a module running the bg job. Used for logging/observability */
  ownerName: string
  workerOptions?: PgBossWorkerOptions
}

export type PgBossJobProcessorDependencies<Queues extends readonly QueueConfiguration[]> = {
  queueManager: PgBossQueueManager<Queues>
  logger: CommonLogger
  errorReporter: ErrorReporter
  transactionObservabilityManager: TransactionObservabilityManager
}
