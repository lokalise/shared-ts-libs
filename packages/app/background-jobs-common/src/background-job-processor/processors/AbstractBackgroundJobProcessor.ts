import type { ErrorReporter } from '@lokalise/node-core'
import { isError, resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type { Job, JobsOptions, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { JobState } from 'bullmq/dist/esm/types/job-type'
import pino from 'pino'
import { merge } from 'ts-deepmerge'

import { DEFAULT_WORKER_OPTIONS } from '../constants'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
import type { BaseJobPayload, BullmqProcessor, RequestContext, SafeJob, SafeQueue } from '../types'
import {
  isStalledJobError,
  isUnrecoverableJobError,
  prepareJobOptions,
  resolveJobId,
  sanitizeRedisConfig,
} from '../utils'

import { BackgroundJobProcessorMonitor } from '../monitoring/BackgroundJobProcessorMonitor'
import type {
  BackgroundJobProcessorConfig,
  BackgroundJobProcessorDependencies,
  JobsPaginatedResponse,
} from './types'

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
  private readonly errorReporter: ErrorReporter // TODO: once hook handling is extracted, errorReporter should be moved to BackgroundJobProcessorMonitor
  private readonly config: BackgroundJobProcessorConfig<QueueOptionsType, WorkerOptionsType>
  private readonly _spy?: BackgroundJobProcessorSpy<JobPayload, JobReturn>
  private readonly monitor: BackgroundJobProcessorMonitor<JobPayload, JobType>
  private readonly runningPromises: Promise<unknown>[]

  private isStarted = false
  private startPromise?: Promise<void>

  private _queue?: QueueType
  private _worker?: WorkerType
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
    this.monitor = new BackgroundJobProcessorMonitor(dependencies, config, this.constructor.name)
    this.config = config
    this.factory = dependencies.bullmqFactory
    this.errorReporter = dependencies.errorReporter
    this._spy = config.isTest ? new BackgroundJobProcessorSpy() : undefined
    this.runningPromises = []
  }

  protected get queue(): Omit<
    QueueType,
    'close' | 'disconnect' | 'obliterate' | 'clean' | 'drain'
  > {
    /* v8 ignore next 3 */
    if (!this._queue) {
      throw new Error(`queue ${this.config.queueId} was not instantiated yet, please run "start()"`)
    }

    return this._queue
  }

  protected get worker(): Omit<WorkerType, 'disconnect' | 'close'> {
    /* v8 ignore next 5 */
    if (!this._worker) {
      throw new Error(
        `worker for queue ${this.config.queueId} was not instantiated yet, please run "start()"`,
      )
    }

    return this._worker
  }

  public get spy(): BackgroundJobProcessorSpyInterface<JobPayload, JobReturn> {
    if (!this._spy)
      throw new Error(
        'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
      )

    return this._spy
  }

  public async start(): Promise<void> {
    if (this.isStarted) return // if it is already started -> skip

    if (!this.startPromise) this.startPromise = this.internalInit()
    await this.startPromise
    this.startPromise = undefined
  }

  private async startIfNotStarted() {
    if (!this.isStarted) await this.start()
  }

  private async internalInit() {
    await this.monitor.registerQueue()

    this._queue = this.factory.buildQueue(this.config.queueId, {
      ...this.config.queueOptions,
      connection: sanitizeRedisConfig(this.config.redisConfig),
      prefix: this.config.redisConfig?.keyPrefix ?? undefined,
    } as unknown as QueueOptionsType)
    await this._queue.waitUntilReady()

    const mergedWorkerOptions = merge(
      DEFAULT_WORKER_OPTIONS,
      this.config.workerOptions,
    ) as unknown as Omit<WorkerOptionsType, 'connection'>
    this._worker = this.factory.buildWorker(
      this.config.queueId,
      (async (job: JobType) => {
        return await this.processInternal(job)
      }) as ProcessorType,
      {
        ...mergedWorkerOptions,
        connection: sanitizeRedisConfig(this.config.redisConfig),
        prefix: this.config.redisConfig?.keyPrefix ?? undefined,
      } as unknown as WorkerOptionsType,
    )
    if (this.config.isTest) {
      // unlike queue, the docs for worker state that this is only useful in tests
      await this._worker.waitUntilReady()
    }

    this.registerListeners()
    this.isStarted = true
  }

  private registerListeners() {
    // TODO: extract hooks handling to a separate class
    this._worker?.on('failed', (job, error) => {
      if (!job) return // Should not be possible with our current config, check 'failed' for more info
      // @ts-expect-error
      this.internalOnFailed(job, error).catch(() => undefined) // nothing to do
    })

    this._worker?.on('completed', (job) => {
      // @ts-expect-error
      this.internalOnSuccess(job, job.requestContext).catch(() => undefined) // nothing to do
    })
  }

  public async dispose(): Promise<void> {
    try {
      await this._worker?.close(this.config.isTest) // On test forcing the worker to close to not wait for current job to finish
      await this._queue?.close()
      await Promise.allSettled(this.runningPromises)
    } catch {
      //do nothing
    }

    this._spy?.clear()
    this.monitor.unregisterQueue()
    this.isStarted = false
  }

  public async schedule(jobData: JobPayload, options?: JobOptionsType): Promise<string> {
    const jobIds = await this.scheduleBulk([jobData], options)
    return jobIds[0]
  }

  public async scheduleBulk(jobData: JobPayload[], options?: JobOptionsType): Promise<string[]> {
    await this.startIfNotStarted()

    const jobs =
      (await this._queue?.addBulk(
        jobData.map((data) => ({
          name: this.config.queueId,
          data,
          opts: prepareJobOptions(this.config.isTest, options),
        })),
      )) ?? []

    const jobIds = jobs.map((job) => job.id)
    /* v8 ignore next 4 */
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

    const jobs = (await this._queue?.getJobs(states, start, end + 1, asc)) ?? []
    const expectedNumberOfJobs = 1 + (end - start)

    return {
      jobs: jobs.slice(0, expectedNumberOfJobs),
      hasMore: jobs.length > expectedNumberOfJobs,
    }
  }

  private async processInternal(job: JobType) {
    const requestContext = this.monitor.getRequestContext(job)

    try {
      this.monitor.jobStart(job, requestContext)

      const result = await this.process(job, requestContext)
      await job.updateProgress(100)
      return result
    } finally {
      this.monitor.jobEnd(job, requestContext)
    }
  }

  private async internalOnSuccess(job: JobType): Promise<void> {
    const requestContext = this.monitor.getRequestContext(job)

    this._spy?.addJob(job, 'completed') // this should be executed before the hook to not be affected by it
    await this.internalOnHook(
      job,
      requestContext,
      async (job, requestContext) => await this.onSuccess(job, requestContext),
    )
  }

  private async internalOnFailed(job: JobType, error: Error): Promise<void> {
    const requestContext = this.monitor.getRequestContext(job)

    requestContext.logger.error(resolveGlobalErrorLogObject(error))
    this.errorReporter.report({
      error,
      context: {
        jobId: resolveJobId(job),
        errorJson: JSON.stringify(pino.stdSerializers.err(error)),
      },
    })

    if (
      isUnrecoverableJobError(error) ||
      isStalledJobError(error) ||
      job.opts.attempts === job.attemptsMade
    ) {
      await this.internalOnHook(job, requestContext, async (job, requestContext) =>
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

  /**
   * Removes all data associated with the job, keeps only correlationId.
   * This method only works if the result of the job is not removed right after it is finished.
   *
   * @param job
   * @protected
   */
  protected async purgeJobData(job: JobType): Promise<void> {
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
}
