import { generateMonotonicUuid } from '@lokalise/id-utils'
import type {
  CommonLogger,
  ErrorReporter,
  RedisConfig,
  TransactionObservabilityManager,
} from '@lokalise/node-core'
import { isError, resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type { Job, JobsOptions, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { JobState } from 'bullmq/dist/esm/types/job-type'
import Redis from 'ioredis'
import pino from 'pino'
import { merge } from 'ts-deepmerge'

import {
  RETENTION_COMPLETED_JOBS_IN_AMOUNT,
  RETENTION_FAILED_JOBS_IN_DAYS,
  RETENTION_QUEUE_IDS_IN_DAYS,
} from '../constants'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory'
import { BackgroundJobProcessorLogger } from '../logger/BackgroundJobProcessorLogger'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
import type { BaseJobPayload, BullmqProcessor, SafeJob, SafeQueue } from '../types'
import {
  daysToMilliseconds,
  daysToSeconds,
  isStalledJobError,
  isUnrecoverableJobError,
  resolveJobId,
} from '../utils'

import type {
  BackgroundJobProcessorConfig,
  BackgroundJobProcessorDependencies,
  JobsPaginatedResponse,
} from './types'

export interface RequestContext {
  logger: CommonLogger
  reqId: string
}

/**
 * Default config
 *    - Retry config: 3 retries with 30s of total amount of wait time between retries using
 *            exponential strategy https://docs.bullmq.io/guide/retrying-failing-jobs#built-in-backoff-strategies
 *    - Job retention: 50 last completed jobs, 7 days for failed jobs
 */
const DEFAULT_JOB_CONFIG: JobsOptions = {
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

const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

const queueIdsSet = new Set<string>()

const DEFAULT_WORKER_OPTIONS = {
  concurrency: 10,
  maxStalledCount: 3, // same as default attempts by default
  ttl: 60,
} as const satisfies Omit<WorkerOptions, 'connection'> & { ttl: number }

export abstract class AbstractBackgroundJobProcessor<
  JobPayload extends BaseJobPayload,
  JobReturn = void,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
  QueueType extends SafeQueue<JobOptionsType, JobPayload, JobReturn> = Queue<JobPayload, JobReturn>,
  QueueOptionsType extends QueueOptions = QueueOptions,
  WorkerType extends Worker<JobPayload, JobReturn> = Worker<JobPayload, JobReturn>,
  WorkerOptionsType extends WorkerOptions = WorkerOptions,
  ProcessorType extends BullmqProcessor<JobType, JobPayload, JobReturn> = BullmqProcessor<
    JobType,
    JobPayload,
    JobReturn
  >,
  JobOptionsType extends JobsOptions = JobsOptions,
> {
  protected readonly logger: CommonLogger

  private redis?: Redis
  private readonly transactionObservabilityManager: TransactionObservabilityManager
  private readonly errorReporter: ErrorReporter
  private readonly config: BackgroundJobProcessorConfig<QueueOptionsType, WorkerOptionsType>
  private readonly _spy?: BackgroundJobProcessorSpy<JobPayload, JobReturn>
  private readonly runningPromises: Promise<unknown>[]

  private queue?: QueueType
  private worker?: WorkerType
  private factory: AbstractBullmqFactory<
    QueueType,
    QueueOptionsType,
    WorkerType,
    WorkerOptionsType,
    ProcessorType,
    JobType,
    JobPayload,
    JobReturn,
    JobOptionsType
  >

  protected constructor(
    dependencies: BackgroundJobProcessorDependencies<
      JobPayload,
      JobReturn,
      JobType,
      JobOptionsType,
      QueueType,
      QueueOptionsType,
      WorkerType,
      WorkerOptionsType,
      ProcessorType
    >,
    config: BackgroundJobProcessorConfig<QueueOptionsType, WorkerOptionsType>,
  ) {
    this.config = config
    this.factory = dependencies.bullmqFactory
    this.redis = new Redis(config.redisConfig)
    this.transactionObservabilityManager = dependencies.transactionObservabilityManager
    this.logger = dependencies.logger
    this.errorReporter = dependencies.errorReporter
    this._spy = config.isTest ? new BackgroundJobProcessorSpy() : undefined
    this.runningPromises = []
  }

  public static async getActiveQueueIds(redisConfig: RedisConfig): Promise<string[]> {
    const redisWithoutPrefix = new Redis(AbstractBackgroundJobProcessor.sanitizeRedisConfig(redisConfig))
    await redisWithoutPrefix.zremrangebyscore(
      QUEUE_IDS_KEY,
      '-inf',
      Date.now() - daysToMilliseconds(RETENTION_QUEUE_IDS_IN_DAYS),
    )
    const queueIds = await redisWithoutPrefix.zrange(QUEUE_IDS_KEY, 0, -1)
    redisWithoutPrefix.disconnect()
    return queueIds.sort()
  }

  public get spy(): BackgroundJobProcessorSpyInterface<JobPayload, JobReturn> {
    if (!this._spy)
      throw new Error(
        'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
      )

    return this._spy
  }

  public async start(): Promise<void> {
    if (this.queue) return // Skip if processor is already started

    if (!this.redis) {
      this.redis = new Redis(this.config.redisConfig)
    }

    if (queueIdsSet.has(this.config.queueId))
      throw new Error(`Queue id "${this.config.queueId}" is not unique.`)

    queueIdsSet.add(this.config.queueId)
    const redisWithoutPrefix = new Redis(AbstractBackgroundJobProcessor.sanitizeRedisConfig(this.config.redisConfig))
    await redisWithoutPrefix.zadd(QUEUE_IDS_KEY, Date.now(), this.config.queueId)
    redisWithoutPrefix.disconnect()

    this.queue = this.factory.buildQueue(this.config.queueId, {
      ...this.config.queueOptions,
      connection: AbstractBackgroundJobProcessor.sanitizeRedisConfig(this.config.redisConfig),
      prefix: this.config.redisConfig?.keyPrefix ?? undefined,
    } as unknown as QueueOptionsType)
    await this.queue.waitUntilReady()

    const mergedWorkerOptions = merge(
      DEFAULT_WORKER_OPTIONS,
      this.config.workerOptions,
    ) as unknown as Omit<WorkerOptionsType, 'connection'>
    this.worker = this.factory.buildWorker(
      this.config.queueId,
      (async (job: JobType) => {
        return await this.processInternal(job)
      }) as ProcessorType,
      {
        ...mergedWorkerOptions,
        connection: AbstractBackgroundJobProcessor.sanitizeRedisConfig(this.config.redisConfig),
        prefix: this.config.redisConfig?.keyPrefix ?? undefined,
      } as unknown as WorkerOptionsType,
    )
    if (this.config.isTest) {
      // unlike queue, the docs for worker state that this is only useful in tests
      await this.worker.waitUntilReady()
    }

    this.registerListeners()
  }

  private async startIfNotStarted() {
    if (!this.queue) {
      this.logger.warn(
        {
          origin: this.constructor.name,
          queueId: this.config.queueId,
        },
        `Processor ${this.constructor.name} is not started, starting with lazy loading`,
      )
      await this.start()
    }
  }

  private registerListeners() {
    this.worker?.on('failed', (job, error) => {
      if (!job) return // Should not be possible with our current config, check 'failed' for more info
      // @ts-expect-error
      this.internalOnFailed(job, error).catch(() => undefined) // nothing to do
    })

    this.worker?.on('completed', (job) => {
      // @ts-expect-error
      this.internalOnSuccess(job, job.requestContext).catch(() => undefined) // nothing to do
    })
  }

  public async dispose(): Promise<void> {
    queueIdsSet.delete(this.config.queueId)

    try {
      // On test forcing the worker to close to not wait for current job to finish
      await this.worker?.close(this.config.isTest)
      await this.queue?.close()
    } catch {
      /* v8 ignore next 3 */
      // do nothing
    }

    try {
      await Promise.allSettled(this.runningPromises)
    } catch {
      //
    }

    try {
      this.redis?.disconnect()
      this.redis = undefined
    } catch {
      //
    }

    this.worker = undefined
    this.queue = undefined
    this._spy?.clear()
  }

  public async schedule(jobData: JobPayload, options?: JobOptionsType): Promise<string> {
    const jobIds = await this.scheduleBulk([jobData], options)
    return jobIds[0]
  }

  public async scheduleBulk(jobData: JobPayload[], options?: JobOptionsType): Promise<string[]> {
    await this.startIfNotStarted()

    const jobs =
      (await this.queue?.addBulk(
        jobData.map((data) => ({
          name: this.config.queueId,
          data,
          opts: this.prepareJobOptions(options ?? ({} as JobOptionsType)),
        })),
      )) ?? []

    const jobIds = jobs.map((job) => job.id)
    /* v8 ignore next 3 */
    if (jobIds.length === 0 || !jobIds.every((id) => !!id)) {
      // Practically unreachable, but we want to simplify the signature of the method and avoid
      // stating that it could return undefined.
      throw new Error('Some scheduled job IDs are undefined')
    }

    if (this._spy) {
      for (const job of jobs) {
        this._spy.addJob(job, 'scheduled')
      }
    }

    return jobIds as string[]
  }

  /**
   * Get jobs in the given states.
   *
   * @param states
   * @param start default 0
   * @param end default 20
   * @param asc default true (oldest first)
   */
  public async getJobsInQueue(
    states: JobState[],
    start = 0,
    end = 20,
    asc = true,
  ): Promise<JobsPaginatedResponse<JobPayload, JobReturn>> {
    if (states.length === 0) throw new Error('states must not be empty')
    if (start > end) throw new Error('start must be less than or equal to end')

    await this.startIfNotStarted()

    const jobs = (await this.queue?.getJobs(states, start, end + 1, asc)) ?? []
    const expectedNumberOfJobs = 1 + (end - start)

    return {
      jobs: jobs.slice(0, expectedNumberOfJobs),
      hasMore: jobs.length > expectedNumberOfJobs,
    }
  }

  private prepareJobOptions(options: JobOptionsType): JobOptionsType {
    const preparedOptions: JobOptionsType = {
      jobId: generateMonotonicUuid(),
      ...DEFAULT_JOB_CONFIG,
      ...options,
    }

    /* v8 ignore next 7 */
    if (this.config.isTest && typeof preparedOptions.backoff === 'object') {
      preparedOptions.backoff.delay = 1
      preparedOptions.backoff.type = 'fixed'
      preparedOptions.removeOnFail = true
      if (preparedOptions.removeOnComplete === undefined) {
        preparedOptions.removeOnComplete = true
      }
    }

    return preparedOptions
  }

  private async processInternal(job: JobType) {
    const jobId = resolveJobId(job)
    let isSuccess = false
    if (!job.requestContext) {
      job.requestContext = {
        logger: new BackgroundJobProcessorLogger(this.resolveExecutionLogger(job), job),
        reqId: jobId,
      }
    }

    try {
      const transactionName = `bg_job:${this.config.ownerName}:${this.config.queueId}`
      this.transactionObservabilityManager.start(transactionName, jobId)
      this.logJobStarted(job, job.requestContext)

      const result = await this.process(job, job.requestContext)
      isSuccess = true

      await job.updateProgress(100)
      return result
    } finally {
      this.logJobFinished(job, job.requestContext, isSuccess)
      this.transactionObservabilityManager.stop(jobId)
    }
  }

  private async internalOnSuccess(job: JobType): Promise<void> {
    const jobId = resolveJobId(job)
    if (!job.requestContext) {
      job.requestContext = {
        logger: new BackgroundJobProcessorLogger(this.resolveExecutionLogger(job), job),
        reqId: jobId,
      }
    }

    this._spy?.addJob(job, 'completed') // this should be executed before the hook to not be affected by it
    await this.internalOnHook(
      job,
      job.requestContext,
      async (job, requestContext) => await this.onSuccess(job, requestContext),
    )
  }

  private async internalOnFailed(job: JobType, error: Error): Promise<void> {
    const jobId = resolveJobId(job)

    if (!job.requestContext) {
      job.requestContext = {
        logger: new BackgroundJobProcessorLogger(this.resolveExecutionLogger(job), job),
        reqId: jobId,
      }
    }

    job.requestContext.logger.error(resolveGlobalErrorLogObject(error, jobId))
    this.errorReporter.report({
      error,
      context: { jobId, errorJson: JSON.stringify(pino.stdSerializers.err(error)) },
    })

    if (
      isUnrecoverableJobError(error) ||
      isStalledJobError(error) ||
      job.opts.attempts === job.attemptsMade
    ) {
      await this.internalOnHook(job, job.requestContext, async (job, requestContext) =>
        this.onFailed(job, error, requestContext),
      )
      this._spy?.addJob(job, 'failed')
    }
  }

  private async internalOnHook(
    job: JobType,
    requestContext: RequestContext,
    onHook: (job: JobType, requestContext: RequestContext) => Promise<void>,
  ) {
    try {
      await onHook(job, requestContext)
    } catch (error) {
      const jobId = resolveJobId(job)
      requestContext.logger.error(resolveGlobalErrorLogObject(error, jobId))

      this.errorReporter.report({
        error: isError(error)
          ? error
          : new Error(`${this.constructor.name} onFailed non-error exception`),
        context: {
          jobId,
          error: JSON.stringify(isError(error) ? pino.stdSerializers.err(error) : error),
        },
      })
    }
  }

  protected resolveExecutionLogger(job: JobType): CommonLogger {
    return this.logger.child({ 'x-request-id': job.data.metadata.correlationId, jobId: job.id })
  }

  logJobStarted(job: JobType, requestContext: RequestContext): void {
    requestContext.logger.info(
      {
        origin: this.constructor.name,
      },
      `Started job ${job.name}`,
    )
  }

  logJobFinished(job: JobType, requestContext: RequestContext, isSuccess: boolean): void {
    requestContext.logger.info(
      {
        isSuccess,
      },
      `Finished job ${job.name}`,
    )
  }

  /**
   * The hook will be triggered on 'completed' job state.
   *
   * @param _job
   * @param _requestContext
   * @protected
   */
  protected onSuccess(_job: JobType, _requestContext: RequestContext): Promise<void> {
    return Promise.resolve()
  }

  /**
   * The hook will be triggered on 'failed' job state.
   *
   * @param _job
   * @param _error
   * @param _requestContext
   * @protected
   */
  protected onFailed(_job: JobType, _error: Error, _requestContext: RequestContext): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Removes all data associated with the job, keeps only correlationId.
   * This method only works if the result of the job is not removed right after it is finished.
   *
   * @param job
   * @protected
   */
  async purgeJobData(job: JobType): Promise<void> {
    const jobOptsRemoveOnComplete = job.opts.removeOnComplete
    if (jobOptsRemoveOnComplete === true || jobOptsRemoveOnComplete === 1) return

    // @ts-ignore
    const updateDataPromise = job.updateData({ metadata: job.data.metadata })
    const clearLogsPromise = job.clearLogs()

    const updateDataPromiseIndex = this.runningPromises.push(updateDataPromise) - 1
    const clearLogsPromiseIndex = this.runningPromises.push(clearLogsPromise) - 1

    await Promise.all([updateDataPromise, clearLogsPromise]).then(() => {
      this.runningPromises.splice(updateDataPromiseIndex, 1)
      this.runningPromises.splice(clearLogsPromiseIndex, 1)
    })
  }

  protected abstract process(job: JobType, requestContext: RequestContext): Promise<JobReturn>

  static sanitizeRedisConfig(config: RedisConfig): RedisConfig {
    return { ...config, keyPrefix: undefined }
  }
}
