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
import { DEFAULT_WORKER_OPTIONS } from '../constants.ts'
import {
  isJobMissingError,
  isMutedUnrecoverableJobError,
  isStalledJobError,
  isUnrecoverableJobError,
} from '../errors/utils.ts'
import type { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy.ts'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types.ts'
import type { BullmqProcessor, RequestContext, SafeJob } from '../types.ts'
import { resolveJobId, resolveQueueId, sanitizeRedisConfig } from '../utils.ts'
import type { BullmqWorkerFactory } from '../factories/BullmqWorkerFactory.ts'
import type { QueueManager } from '../managers/QueueManager.ts'
import type {
  JobPayloadForQueue,
  QueueConfiguration,
  SupportedJobPayloads,
  SupportedQueueIds,
} from '../managers/types.ts'
import { BackgroundJobProcessorMonitor } from '../monitoring/BackgroundJobProcessorMonitor.ts'
import type {
  BackgroundJobProcessorConfigNew,
  BackgroundJobProcessorDependenciesNew,
  ProtectedQueue,
  ProtectedWorker,
} from './types.ts'

export abstract class AbstractBackgroundJobProcessorNew<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  QueueId extends SupportedQueueIds<Queues>,
  JobReturn = void,
  ExecutionContext = undefined,
  JobType extends SafeJob<JobPayloadForQueue<Queues, QueueId>, JobReturn> = Job<
    JobPayloadForQueue<Queues, QueueId>,
    JobReturn
  >,
  JobOptionsType extends JobsOptions = JobsOptions,
  QueueType extends Queue<
    SupportedJobPayloads<Queues>,
    JobReturn,
    string,
    SupportedJobPayloads<Queues>,
    JobReturn,
    string
  > = Queue<
    SupportedJobPayloads<Queues>,
    JobReturn,
    string,
    SupportedJobPayloads<Queues>,
    JobReturn,
    string
  >,
  QueueOptionsType extends QueueOptions = QueueOptions,
  WorkerType extends Worker<SupportedJobPayloads<Queues>, JobReturn> = Worker<
    SupportedJobPayloads<Queues>,
    JobReturn
  >,
  WorkerOptionsType extends WorkerOptions = WorkerOptions,
  ProcessorType extends BullmqProcessor<
    JobType,
    JobPayloadForQueue<Queues, QueueId>,
    JobReturn
  > = BullmqProcessor<JobType, JobPayloadForQueue<Queues, QueueId>, JobReturn>,
> {
  // TODO: once hook handling is extracted, errorReporter should be moved to BackgroundJobProcessorMonitor
  private readonly errorReporter: ErrorReporter
  private readonly config: BackgroundJobProcessorConfigNew<
    Queues,
    QueueId,
    WorkerOptionsType,
    ExecutionContext,
    JobReturn,
    JobType
  >
  private readonly _spy?: BackgroundJobProcessorSpy<JobPayloadForQueue<Queues, QueueId>, JobReturn>
  private readonly monitor: BackgroundJobProcessorMonitor<
    JobPayloadForQueue<Queues, QueueId>,
    JobType
  >
  private readonly runningPromises: Set<Promise<unknown>>
  private readonly factory: BullmqWorkerFactory<
    WorkerType,
    WorkerOptionsType,
    JobType,
    ProcessorType
  >
  private readonly queueManager: QueueManager<Queues, QueueType, QueueOptionsType, JobOptionsType>

  private _executionContext?: ExecutionContext
  private startPromise?: Promise<void>
  private _worker?: WorkerType

  protected constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<
      Queues,
      QueueId,
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
      ExecutionContext,
      JobReturn,
      JobType
    >,
  ) {
    this.config = config

    this.factory = dependencies.workerFactory
    this.queueManager = dependencies.queueManager
    this.errorReporter = dependencies.errorReporter

    this._spy = this.queueManager.config.isTest
      ? (this.queueManager.getSpy<QueueId, JobReturn>(this.queueId) as BackgroundJobProcessorSpy<
          JobPayloadForQueue<Queues, QueueId>,
          JobReturn
        >)
      : undefined
    this.runningPromises = new Set()
    this.monitor = new BackgroundJobProcessorMonitor(
      dependencies,
      { ...config, redisConfig: this.queueManager.config.redisConfig },
      this.constructor.name,
    )
  }

  public get queueId(): QueueId {
    return this.config.queueId
  }

  protected get executionContext() {
    if (!this._executionContext) this._executionContext = this.resolveExecutionContext()

    return this._executionContext
  }

  protected get worker(): ProtectedWorker<
    JobPayloadForQueue<Queues, QueueId>,
    JobReturn,
    WorkerType
  > {
    /* v8 ignore next 5 */
    if (!this._worker) {
      throw new Error(
        `worker for queue ${this.queueId} was not instantiated yet, please run "start()"`,
      )
    }

    return this._worker
  }

  protected get queue(): ProtectedQueue<JobPayloadForQueue<Queues, QueueId>, JobReturn, QueueType> {
    return this.queueManager.getQueue(this.queueId)
  }

  public get spy(): BackgroundJobProcessorSpyInterface<
    JobPayloadForQueue<Queues, QueueId>,
    JobReturn
  > {
    return this.queueManager.getSpy<QueueId, JobReturn>(this.queueId)
  }

  public async start(): Promise<void> {
    if (this.isStarted) return // if it is already started -> skip
    if (!this.startPromise) this.startPromise = this.internalStart()

    await this.startPromise
    this.startPromise = undefined
  }

  private get isStarted(): boolean {
    return !!this._worker
  }

  private async internalStart(): Promise<void> {
    await this.monitor.registerQueue()

    const redisConfig = this.queueManager.config.redisConfig
    const queueConfig = this.queueManager.getQueueConfig(this.queueId)

    this._worker = this.factory.buildWorker(
      resolveQueueId(queueConfig),
      ((job: JobType) => this.processInternal(job)) as ProcessorType,
      {
        ...(merge(DEFAULT_WORKER_OPTIONS, this.config.workerOptions) as Omit<
          WorkerOptionsType,
          'connection' | 'prefix'
        >),
        connection: sanitizeRedisConfig(redisConfig),
        prefix: redisConfig.keyPrefix ?? undefined,
      } as unknown as WorkerOptionsType,
    )
    if (this.queueManager.config.isTest) {
      // unlike queue, the docs for worker state that this is only useful in tests
      await this._worker.waitUntilReady()
    }

    this.registerListeners()
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
      await this._worker?.close(this.queueManager.config.isTest)
      await Promise.allSettled(this.runningPromises)
    } catch {
      // do nothing
    }

    this._spy?.clear()
    this.monitor.unregisterQueue()
    this._worker = undefined
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
