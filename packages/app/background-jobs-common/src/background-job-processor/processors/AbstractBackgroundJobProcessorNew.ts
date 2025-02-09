import type { ErrorReporter } from '@lokalise/node-core'
import { isError, resolveGlobalErrorLogObject } from '@lokalise/node-core'
import {
  DelayedError,
  type Job,
  type JobsOptions,
  type Queue,
  type QueueOptions,
  type Worker,
  type WorkerOptions,
} from 'bullmq'
import pino, { stdSerializers } from 'pino'
import { merge } from 'ts-deepmerge'

import { DEFAULT_WORKER_OPTIONS } from '../constants'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
import type { BullmqProcessor, RequestContext, SafeJob } from '../types'
import {
  isJobMissingError,
  isStalledJobError,
  isUnrecoverableJobError,
  resolveJobId,
  sanitizeRedisConfig,
} from '../utils'

import type { QueueManager } from '../managers/QueueManager'
import type { JobPayloadForQueue, QueueConfiguration, SupportedQueueIds } from '../managers/types'
import { BackgroundJobProcessorMonitor } from '../monitoring/BackgroundJobProcessorMonitor'
import type {
  BackgroundJobProcessorConfigNew,
  BackgroundJobProcessorDependenciesNew,
  ProtectedQueue,
  ProtectedWorker,
} from './types'

export abstract class AbstractBackgroundJobProcessorNew<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  QueueId extends SupportedQueueIds<Queues>,
  JobPayload extends JobPayloadForQueue<Queues, QueueId> = JobPayloadForQueue<Queues, QueueId>,
  JobReturn = void,
  ExecutionContext = undefined,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
  JobOptionsType extends JobsOptions = JobsOptions,
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
> {
  // TODO: once hook handling is extracted, errorReporter should be moved to BackgroundJobProcessorMonitor
  private readonly errorReporter: ErrorReporter
  private readonly config: BackgroundJobProcessorConfigNew<
    Queues,
    QueueId,
    WorkerOptionsType,
    JobPayload,
    ExecutionContext,
    JobReturn,
    JobType
  >
  private readonly _spy?: BackgroundJobProcessorSpy<JobPayload, JobReturn>
  private readonly monitor: BackgroundJobProcessorMonitor<JobPayload, JobType>
  private readonly runningPromises: Set<Promise<unknown>>
  private readonly factory: AbstractBullmqFactory<
    Queue,
    QueueOptions,
    WorkerType,
    WorkerOptionsType,
    ProcessorType,
    JobType,
    JobPayload,
    JobReturn
  >
  private readonly queueManager: QueueManager<Queues, JobOptionsType, QueueType, QueueOptionsType>

  private _executionContext?: ExecutionContext
  private isStarted = false
  private startPromise?: Promise<void>
  private _worker?: WorkerType

  protected constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<
      Queues,
      QueueId,
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
    config: BackgroundJobProcessorConfigNew<
      Queues,
      QueueId,
      WorkerOptionsType,
      JobPayload,
      ExecutionContext,
      JobReturn,
      JobType
    >,
  ) {
    this.config = config

    this.factory = dependencies.bullmqFactory
    this.queueManager = dependencies.queueManager
    this.errorReporter = dependencies.errorReporter

    this._spy = config.isTest ? new BackgroundJobProcessorSpy() : undefined
    this.runningPromises = new Set()
    this.monitor = new BackgroundJobProcessorMonitor(dependencies, config, this.constructor.name)
  }

  protected get executionContext() {
    /* v8 ignore next 3 */
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

  protected get queue(): ProtectedQueue<JobPayload, JobReturn, QueueType> {
    return this.queueManager.getQueue(this.config.queueId)
  }

  public get spy(): BackgroundJobProcessorSpyInterface<JobPayload, JobReturn> {
    /* v8 ignore next 4 */
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

  private async internalStart(): Promise<void> {
    await this.monitor.registerQueue()

    this._worker = this.factory.buildWorker(
      this.config.queueId,
      ((job: JobType) => this.processInternal(job)) as ProcessorType,
      {
        ...(merge(DEFAULT_WORKER_OPTIONS, this.config.workerOptions) as Omit<
          WorkerOptionsType,
          'connection' | 'prefix'
        >),
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
      // await this._queue?.close()
      await Promise.allSettled(this.runningPromises)
      /* v8 ignore next 3 */
    } catch {
      //do nothing
    }

    this._spy?.clear()
    this.monitor.unregisterQueue()
    this.isStarted = false
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
    this.errorReporter.report({
      error,
      context: {
        jobId: resolveJobId(job),
        jobName: job.name,
        'x-request-id': job.data.metadata.correlationId,
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

  /* v8 ignore next 3 */
  protected resolveExecutionContext(): ExecutionContext {
    return undefined as ExecutionContext
  }
}
