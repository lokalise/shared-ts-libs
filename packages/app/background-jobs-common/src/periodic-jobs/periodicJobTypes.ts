import type {
  CommonLogger,
  ErrorReporter,
  TransactionObservabilityManager,
} from '@lokalise/node-core'
import type Redis from 'ioredis'
import type { ToadScheduler } from 'toad-scheduler'
import type { RequestContext } from '../background-job-processor'

export type Schedule =
  | {
      /**
       * The interval in milliseconds at which the job should run.
       */
      intervalInMs: number
      cron?: never
    }
  | {
      intervalInMs?: never
      cron?: {
        /**
         * Cron expression with 5 mandatory and 1 optional positions (optional second, then minute, hour, day of month, month, day of week)
         */
        cronExpression: string

        /**
         * If not specified, local timezone will be used
         */
        timezone?: string
      }
      /**
       * The cron interval at which the job should run.
       */
    }

export type BackgroundJobConfiguration = {
  /**
   * Job unique name
   */
  jobId: string
  schedule: Schedule
  /**
   * Allows to run the job exclusively in a single instance of the application.
   * The first consumer that acquires the lock will be the only one to run the job until it stops refreshing the lock.
   * Default is false
   */
  singleConsumerMode?: {
    exclusiveLockSuffix?: string
    enabled: boolean
    /**
     * By default, the lock TTL is 2 * intervalInMs, to prevent the lock from expiring before the next execution.
     */
    lockTimeout?: number

    /**
     * Lock will be reset to this value after success, so that other node could potentially acquire the lock after it expires, but in order to prevent immediate acquire
     */
    lockTimeoutAfterSuccess?: number
  }
  /**
   * If true, the job will log when it starts and finishes. Default is false
   */
  shouldLogExecution?: boolean
}

export type LockConfiguration = {
  lockSuffix?: string
  identifier?: string
  refreshInterval?: number
  lockTimeout?: number
  acquiredExternally?: true
}

export type PeriodicJobDependencies = {
  redis: Redis
  logger: CommonLogger
  transactionObservabilityManager: TransactionObservabilityManager
  errorReporter: ErrorReporter
  scheduler: ToadScheduler
}

export type JobExecutionContext = RequestContext & {
  executorId: string
}
