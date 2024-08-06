import { randomUUID } from 'node:crypto'

import {
  type CommonLogger,
  type ErrorReporter,
  type TransactionObservabilityManager,
  isError,
} from '@lokalise/node-core'
import { resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type Redis from 'ioredis'
import { stdSerializers } from 'pino'
import type { LockOptions } from 'redis-semaphore'
import { Mutex } from 'redis-semaphore'
import type { LockLostCallback } from 'redis-semaphore'
import type { ToadScheduler } from 'toad-scheduler'
import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler'

const DEFAULT_JOB_INTERVAL = 60000
const DEFAULT_LOCK_SUFFIX = 'EXCLUSIVE:'

export type BackgroundJobConfiguration = {
  /**
   * Job unique name
   */
  jobId: string
  /**
   * The interval in milliseconds at which the job should run.
   */
  intervalInMs?: number
  /**
   * Allows to run the job exclusively in a single instance of the application.
   * The first consumer that acquires the lock will be the only one to run the job until it stops refreshing the lock.
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
   * If true, the job will log when it starts and finishes.
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

export function createTask(logger: CommonLogger, job: AbstractPeriodicJob) {
  const executorId = randomUUID()

  logger.info({
    msg: 'Periodic job registered',
    jobId: job.options.jobId,
    executorId,
  })

  return new AsyncTask(
    job.options.jobId,
    () => {
      return job.process(executorId)
    },
    /* v8 ignore next 9 */
    (error) => {
      logger.error(
        stdSerializers.err({
          name: error.name,
          message: error.message,
          stack: error.stack,
        }),
      )
    },
  )
}

export type PeriodicJobDependencies = {
  redis: Redis
  logger: CommonLogger
  transactionObservabilityManager: TransactionObservabilityManager
  errorReporter: ErrorReporter
  scheduler: ToadScheduler
}

export abstract class AbstractPeriodicJob {
  public readonly options: Required<BackgroundJobConfiguration>
  protected readonly redis: Redis
  protected readonly transactionObservabilityManager: TransactionObservabilityManager
  protected readonly logger: CommonLogger
  protected readonly errorReporter: ErrorReporter
  protected readonly scheduler: ToadScheduler
  private singleConsumerLock?: Mutex

  protected constructor(
    options: BackgroundJobConfiguration,
    {
      redis,
      logger,
      transactionObservabilityManager,
      errorReporter,
      scheduler,
    }: PeriodicJobDependencies,
  ) {
    this.options = {
      intervalInMs: DEFAULT_JOB_INTERVAL,
      shouldLogExecution: false,
      ...options,
      singleConsumerMode: {
        enabled: false,
        exclusiveLockSuffix: options.singleConsumerMode?.exclusiveLockSuffix ?? 'EXCLUSIVE',
        lockTimeout: (options.intervalInMs ?? DEFAULT_JOB_INTERVAL) * 2,
        ...options.singleConsumerMode,
      },
    }
    this.logger = logger
    this.redis = redis
    this.transactionObservabilityManager = transactionObservabilityManager
    this.errorReporter = errorReporter
    this.scheduler = scheduler
  }

  public register() {
    const task = createTask(this.logger, this)

    this.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob(
        {
          milliseconds: this.options.intervalInMs,
          runImmediately: true,
        },
        task,
        {
          id: this.options.jobId,
          preventOverrun: true,
        },
      ),
    )
  }

  public async dispose() {
    this.scheduler.stopById(this.options.jobId)
    await this.singleConsumerLock?.release()
  }

  protected abstract processInternal(executionUuid: string): Promise<unknown>

  public async process(executorId: string) {
    const logger = this.resolveExecutionLogger(executorId)

    if (this.options.singleConsumerMode.enabled) {
      // acquire or update lock
      this.singleConsumerLock = await this.tryAcquireExclusiveLock({
        lockSuffix: this.options.singleConsumerMode.exclusiveLockSuffix,
        lockTimeout: this.options.singleConsumerMode.lockTimeout,
        identifier: executorId,
      })

      if (!this.singleConsumerLock) {
        logger.debug('Periodic job skipped: unable to acquire single consumer lock')
        return
      }
    }

    try {
      this.transactionObservabilityManager.start(this.options.jobId, executorId)
      if (this.options.shouldLogExecution) logger.info('Periodic job started')

      await this.processInternal(executorId)
    } catch (err) {
      logger.error({
        ...resolveGlobalErrorLogObject(err, executorId),
        msg: 'Error during periodic job execution',
      })

      if (isError(err)) {
        this.errorReporter.report({
          error: err,
          context: {
            executorId: executorId,
          },
        })
      }
    } finally {
      await this.updateLockPostExecution()

      if (this.options.shouldLogExecution) logger.info('Periodic job finished')
      this.transactionObservabilityManager.stop(executorId)
    }
  }

  // stop auto-refreshing the lock to let it expire
  private async updateLockPostExecution() {
    if (this.singleConsumerLock) {
      await this.updateMutex(
        this.singleConsumerLock,
        this.options.singleConsumerMode.lockTimeoutAfterSuccess ?? this.options.intervalInMs,
        this.options.singleConsumerMode.exclusiveLockSuffix,
        // it is fine to lose lock at this point
        () => {},
        0,
      )
      this.singleConsumerLock.stopRefresh()
    }
  }

  protected getJobMutex(lockSuffix: string, options: LockOptions) {
    return new Mutex(this.redis, this.getJobLockName(lockSuffix), options)
  }

  protected async tryAcquireExclusiveLock(lockConfiguration?: LockConfiguration) {
    const mutexOptions = {
      acquireAttemptsLimit: 1,
      refreshInterval: lockConfiguration?.refreshInterval,
      acquiredExternally: lockConfiguration?.acquiredExternally,
      identifier: lockConfiguration?.identifier,
      lockTimeout: lockConfiguration?.lockTimeout ?? this.options.singleConsumerMode.lockTimeout,
      /* v8 ignore next 8 */
      onLockLost: (error) => {
        this.errorReporter.report({
          error,
          context: {
            jobId: this.options.jobId,
          },
        })
      },
    } satisfies LockOptions

    // Try to acquire a fresh lock
    let lock = this.getJobMutex(lockConfiguration?.lockSuffix ?? DEFAULT_LOCK_SUFFIX, mutexOptions)
    let acquired = await lock.tryAcquire()

    // If lock has been acquired previously by this instance, try to refresh
    if (!acquired && lockConfiguration?.identifier) {
      lock = this.getJobMutex(lockConfiguration.lockSuffix ?? DEFAULT_LOCK_SUFFIX, {
        ...mutexOptions,

        acquiredExternally: true,
      })
      acquired = await lock.tryAcquire()
    }

    // If someone else already has this lock, skip
    if (!acquired) {
      return
    }

    return lock
  }

  protected async updateMutex(
    mutex: Mutex,
    newLockTimeout: number,
    lockSuffix?: string,
    onLockLost?: LockLostCallback,
    refreshInterval?: number,
  ) {
    const newMutex = new Mutex(this.redis, this.getJobLockName(lockSuffix ?? DEFAULT_LOCK_SUFFIX), {
      acquiredExternally: true,
      identifier: mutex.identifier,
      lockTimeout: newLockTimeout,
      refreshInterval,
      onLockLost: onLockLost,
    })

    const lock = await newMutex.tryAcquire()
    if (!lock) {
      return
    }

    return newMutex
  }

  protected getJobLockName(keySuffix: string) {
    return `${this.options.jobId}:locks:${keySuffix}`
  }

  protected resolveExecutionLogger(executorId: string): CommonLogger {
    return this.logger.child({
      executorId,
      jobId: this.options.jobId,
    })
  }
}
