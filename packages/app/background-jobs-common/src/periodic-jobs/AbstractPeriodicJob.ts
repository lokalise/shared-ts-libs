import { generateMonotonicUuid } from '@lokalise/id-utils'
import {
  type CommonLogger,
  type ErrorReporter,
  type TransactionObservabilityManager,
  isError,
} from '@lokalise/node-core'
import { resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type Redis from 'ioredis'
import type { LockOptions } from 'redis-semaphore'
import { Mutex } from 'redis-semaphore'
import type { LockLostCallback } from 'redis-semaphore'
import { CronJob, type ToadScheduler } from 'toad-scheduler'
import { SimpleIntervalJob } from 'toad-scheduler'
import type {
  BackgroundJobConfiguration,
  JobExecutionContext,
  LockConfiguration,
  PeriodicJobDependencies,
} from './periodicJobTypes'
import { createTask } from './periodicJobUtils'

const DEFAULT_EXCLUSIVE_LOCK_SUFFIX = 'EXCLUSIVE'
const DEFAULT_LOCK_TIMEOUT = 120000

export abstract class AbstractPeriodicJob {
  public readonly jobId: string
  protected readonly options: Required<BackgroundJobConfiguration>
  protected readonly errorReporter: ErrorReporter
  protected readonly redis: Redis
  private readonly logger: CommonLogger
  private readonly transactionObservabilityManager: TransactionObservabilityManager
  private readonly scheduler: ToadScheduler
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
    this.jobId = options.jobId
    this.options = {
      shouldLogExecution: false,
      ...options,
      singleConsumerMode: {
        enabled: false,
        exclusiveLockSuffix: options.singleConsumerMode?.exclusiveLockSuffix ?? 'EXCLUSIVE',
        lockTimeout: options.schedule.intervalInMs
          ? options.schedule.intervalInMs * 2
          : DEFAULT_LOCK_TIMEOUT,
        ...options.singleConsumerMode,
      },
    }
    this.logger = logger
    this.redis = redis
    this.transactionObservabilityManager = transactionObservabilityManager
    this.errorReporter = errorReporter
    this.scheduler = scheduler
  }

  public register(): void {
    const task = createTask(this.logger, this)

    if (this.options.schedule.intervalInMs) {
      this.scheduler.addSimpleIntervalJob(
        new SimpleIntervalJob(
          {
            milliseconds: this.options.schedule.intervalInMs,
            runImmediately: true,
          },
          task,
          {
            id: this.jobId,
            preventOverrun: true,
          },
        ),
      )
      return
    }

    if (this.options.schedule.cron) {
      this.scheduler.addCronJob(
        new CronJob(this.options.schedule.cron, task, {
          id: this.jobId,
          preventOverrun: true,
        }),
      )
      return
    }

    throw new Error('Invalid config, please specify intervalInMs or cron parameters')
  }

  public async dispose() {
    this.scheduler.stopById(this.jobId)
    await this.singleConsumerLock?.release()
  }

  protected abstract processInternal(context: JobExecutionContext): Promise<unknown>

  public async process(executorId: string) {
    const correlationId = generateMonotonicUuid()
    const logger = this.resolveExecutionLogger(executorId, correlationId)

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
      this.transactionObservabilityManager.start(this.jobId, executorId)
      if (this.options.shouldLogExecution) logger.info('Periodic job started')

      await this.processInternal({
        logger,
        executorId,
        reqId: correlationId,
      })
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
        this.options.singleConsumerMode.lockTimeoutAfterSuccess ??
          this.options.schedule.intervalInMs ??
          DEFAULT_LOCK_TIMEOUT,
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
            jobId: this.jobId,
          },
        })
      },
    } satisfies LockOptions

    // Try to acquire a fresh lock
    let lock = this.getJobMutex(
      lockConfiguration?.lockSuffix ?? DEFAULT_EXCLUSIVE_LOCK_SUFFIX,
      mutexOptions,
    )
    let acquired = await lock.tryAcquire()

    // If lock has been acquired previously by this instance, try to refresh
    if (!acquired && lockConfiguration?.identifier) {
      lock = this.getJobMutex(lockConfiguration.lockSuffix ?? DEFAULT_EXCLUSIVE_LOCK_SUFFIX, {
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
    const newMutex = new Mutex(
      this.redis,
      this.getJobLockName(lockSuffix ?? DEFAULT_EXCLUSIVE_LOCK_SUFFIX),
      {
        acquiredExternally: true,
        identifier: mutex.identifier,
        lockTimeout: newLockTimeout,
        refreshInterval,
        onLockLost: onLockLost,
      },
    )

    const lock = await newMutex.tryAcquire()
    if (!lock) {
      return
    }

    return newMutex
  }

  protected getJobLockName(keySuffix: string) {
    return `${this.jobId}:locks:${keySuffix}`
  }

  protected resolveExecutionLogger(executorId: string, correlationId: string): CommonLogger {
    return this.logger.child({
      executorId,
      'x-request-id': correlationId,
      jobId: this.jobId,
    })
  }
}
