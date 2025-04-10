import type { ErrorReporter } from '@lokalise/node-core'
import { isError, resolveGlobalErrorLogObject } from '@lokalise/node-core'
import {
  DelayedError,
  type Job,
  type JobState,
  type JobsOptions,
  type Queue,
  type QueueOptions,
  type Worker,
  type WorkerOptions,
} from 'bullmq'
import pino, { stdSerializers } from 'pino'
import { merge } from 'ts-deepmerge'
import { DEFAULT_QUEUE_OPTIONS, DEFAULT_WORKER_OPTIONS } from '../constants.js'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory.js'
import { BackgroundJobProcessorMonitor } from '../monitoring/BackgroundJobProcessorMonitor.js'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy.js'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types.js'
import type { BaseJobPayload, BullmqProcessor, RequestContext, SafeJob } from '../types.js'
import {
  isJobMissingError,
  isMutedUnrecoverableJobError,
  isStalledJobError,
  isUnrecoverableJobError,
  prepareJobOptions,
  resolveJobId,
  sanitizeRedisConfig,
} from '../utils.js'
import type {
  BackgroundJobProcessorConfig,
  BackgroundJobProcessorDependencies,
  JobsPaginatedResponse,
  ProtectedQueue,
  ProtectedWorker,
} from './types.js'

/**
 * @deprecated This processor is deprecated and will be removed in future versions.
 */
export abstract class AbstractBackgroundJobProcessor<
  JobPayload extends BaseJobPayload,
  JobReturn = void,
  ExecutionContext = undefined,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
  QueueType extends Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string> = Queue<
    JobPayload,
    JobReturn,
    string,
    JobPayload,
    JobReturn,
    string
  >,
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
  private readonly errorReporter: ErrorReporter
  private readonly config: BackgroundJobProcessorConfig<
    QueueOptionsType,
    WorkerOptionsType,
    JobPayload,
    ExecutionContext,
    JobReturn,
    JobType
  >
  private readonly _spy?: BackgroundJobProcessorSpy<JobPayload, JobReturn>
  private readonly monitor: BackgroundJobProcessorMonitor<JobPayload, JobType>
  private readonly runningPromises: Set<Promise<unknown>>

  private isStarted = false
  private startPromise?: Promise<void>

  private _executionContext?: ExecutionContext
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
    JobReturn
  >

  protected constructor(
    dependencies: BackgroundJobProcessorDependencies<
      JobPayload,
      JobReturn,
      JobType,
      QueueType,
      QueueOptionsType,
      WorkerType,
      WorkerOptionsType,
      ProcessorType
    >,
    config: BackgroundJobProcessorConfig<
      QueueOptionsType,
      WorkerOptionsType,
      JobPayload,
      ExecutionContext,
      JobReturn,
      JobType
    >,
  ) {
    this.monitor = new BackgroundJobProcessorMonitor(dependencies, config, this.constructor.name)
    this.config = config
    this.factory = dependencies.bullmqFactory
    this.errorReporter = dependencies.errorReporter
    this._spy = config.isTest ? new BackgroundJobProcessorSpy() : undefined
    this.runningPromises = new Set()
  }

  public async getJobCount(): Promise<number> {
    await this.startIfNotStarted()
    return this.queue.getJobCountByTypes(
      'active',
      'waiting',
      'paused',
      'delayed',
      'prioritized',
      'waiting-children',
    )
  }

  protected get queue(): ProtectedQueue<JobPayload, JobReturn, QueueType> {
    /* v8 ignore next 3 */
    if (!this._queue) {
      throw new Error(`queue ${this.config.queueId} was not instantiated yet, please run "start()"`)
    }

    return this._queue
  }

  protected get executionContext() {
    if (!this._executionContext) {
      this._executionContext = this.resolveExecutionContext()
    }

    return this._executionContext
  }

  protected get worker(): ProtectedWorker<JobPayload, JobReturn, WorkerType> {
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

    if (!this.startPromise) this.startPromise = this.internalStart()
    await this.startPromise
    this.startPromise = undefined
  }

  private startIfNotStarted(): Promise<void> {
    if (this.isStarted) return Promise.resolve()

    if (this.config.lazyInitEnabled === false) {
      throw new Error('Processor not started, please call `start` or enable lazy init')
    }
    return this.start()
  }

  private async internalStart(): Promise<void> {
    await this.monitor.registerQueue()

    this._queue = this.factory.buildQueue(this.config.queueId, {
      ...(merge(DEFAULT_QUEUE_OPTIONS, this.config.queueOptions ?? {}) as Omit<
        QueueOptionsType,
        'connection' | 'prefix'
      >),
      connection: sanitizeRedisConfig(this.config.redisConfig),
      prefix: this.config.redisConfig?.keyPrefix ?? undefined,
    } as unknown as QueueOptionsType)
    await this._queue.waitUntilReady()

    this._worker = this.factory.buildWorker(
      this.config.queueId,
      ((job: JobType) => this.processInternal(job)) as ProcessorType,
      {
        ...(merge(DEFAULT_WORKER_OPTIONS, this.config.workerOptions, {
          autorun: this.config.workerAutoRunEnabled !== false,
        }) as Omit<WorkerOptionsType, 'connection' | 'prefix'>),
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

  private registerListeners(): void {
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
    if (!this.isStarted) return

    try {
      // On test forcing the worker to close to not wait for current job to finish
      await this._worker?.close(this.config.isTest)
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
    await this.startIfNotStarted()

    const job = await this._queue?.add(
      this.config.queueId,
      jobData,
      prepareJobOptions(this.config.isTest, options),
    )
    if (!job?.id) throw new Error('Scheduled job ID is undefined')
    if (this._spy) this._spy.addJob(job, 'scheduled')

    return job.id
  }

  public async scheduleBulk(
    jobData: JobPayload[],
    options?: Omit<JobOptionsType, 'repeat'>,
  ): Promise<string[]> {
    if (jobData.length === 0) return []

    await this.startIfNotStarted()

    const jobs =
      (await this._queue?.addBulk(
        jobData.map((data) => ({
          name: this.config.queueId,
          data: data,
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
    if (this._spy) this._spy.addJobs(jobs, 'scheduled')

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

  private async processInternal(job: JobType): Promise<JobReturn> {
    const requestContext = this.monitor.getRequestContext(job)

    try {
      this.monitor.jobStart(job, requestContext)

      if (this.config.barrier) {
        const barrierResult = await this.config.barrier(job, this.executionContext)
        if (!barrierResult.isPassing) {
          const nextTryTimestamp = Date.now() + barrierResult.delayAmountInMs
          requestContext.logger.debug({ nextTryTimestamp }, 'Did not pass the barrier')

          await job.moveToDelayed(nextTryTimestamp, job.token)
          throw new DelayedError()
        }
      }

      const result = await this.process(job, requestContext)
      await job.updateProgress(100)
      return result
    } catch (error) {
      this.monitor.jobAttemptError(job, error, requestContext)
      throw error
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
    // Report errors unless they are muted UnrecoverableError from BullMQ
    if (!isMutedUnrecoverableJobError(error)) {
      this.errorReporter.report({
        error,
        context: {
          jobId: resolveJobId(job),
          jobName: job.name,
          'x-request-id': job.data.metadata.correlationId,
          errorJson: JSON.stringify(pino.stdSerializers.err(error)),
        },
      })
    }

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
  ): Promise<void> {
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
          jobName: job.name,
          'x-request-id': job.data.metadata.correlationId,
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

    const updateDataPromise = job
      // @ts-expect-error
      .updateData({ metadata: job.data.metadata })
      .finally(() => this.runningPromises.delete(updateDataPromise))

    this.runningPromises.add(updateDataPromise)

    const clearLogsPromise = job
      .clearLogs()
      .finally(() => this.runningPromises.delete(clearLogsPromise))

    this.runningPromises.add(clearLogsPromise)

    // Purging will fail if the job is already removed (job can be removed manually, by user, or by BullMQ in certain scenarios),
    // Since this is expected and should not be considered an error, we will silence down such errors.
    const purgeErrors = (await Promise.allSettled([updateDataPromise, clearLogsPromise]))
      .filter((result) => result.status === 'rejected' && !isJobMissingError(result.reason))
      .map((result) => (result as PromiseRejectedResult).reason)

    if (purgeErrors.length > 0) {
      const serializedPurgeErrors = purgeErrors.map((error) =>
        JSON.stringify(isError(error) ? stdSerializers.err(error) : error),
      )
      throw new Error(`Job data purge failed: ${serializedPurgeErrors.join(', ')}`)
    }
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

  protected resolveExecutionContext(): ExecutionContext {
    return undefined as ExecutionContext
  }
}
