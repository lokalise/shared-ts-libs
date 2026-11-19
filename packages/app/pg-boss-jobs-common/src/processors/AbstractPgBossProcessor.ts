import { resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type { JobResult, JobSpyInterface, JobWithMetadata, WorkOptions } from 'pg-boss'
import type { ZodError } from 'zod/v4'
import { PgBossProcessorMonitor } from '../monitoring/PgBossProcessorMonitor.ts'
import type { JobPayloadForQueue, QueueConfiguration, SupportedQueueIds } from '../queues/types.ts'
import type { RequestContext } from '../types.ts'
import type {
  PgBossJob,
  PgBossJobProcessorConfig,
  PgBossJobProcessorDependencies,
} from './types.ts'

/**
 * Forced in test mode: poll at pg-boss's minimum interval instead of the 2s default, so jobs are
 * picked up promptly and tests stay fast.
 */
const TEST_WORK_OPTIONS = { pollingIntervalSeconds: 0.5 } as const satisfies WorkOptions

/** The dispositions pg-boss accepts for one job of a `perJobResults` batch. */
export const JOB_RESULT = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  DEADLETTER: 'deadletter',
} as const satisfies Record<string, JobResult['status']>

/**
 * What both processor flavours share: the worker lifecycle, and validating every payload before
 * the subclass sees it. The handler runs with `perJobResults`, so pg-boss settles each job of a
 * batch on the disposition returned for it rather than all of them on one outcome.
 */
export abstract class AbstractPgBossProcessor<
  Queues extends readonly QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues>,
> {
  protected readonly queueManager: PgBossJobProcessorDependencies<Queues>['queueManager']
  protected readonly monitor: PgBossProcessorMonitor

  private readonly config: PgBossJobProcessorConfig<QueueId>
  private startPromise?: Promise<void>
  private workId?: string

  protected constructor(
    dependencies: PgBossJobProcessorDependencies<Queues>,
    config: PgBossJobProcessorConfig<QueueId>,
  ) {
    this.queueManager = dependencies.queueManager
    this.config = config
    this.monitor = new PgBossProcessorMonitor(dependencies, {
      queueId: config.queueId,
      ownerName: config.ownerName,
      processorName: this.constructor.name,
    })
  }

  public get queueId(): QueueId {
    return this.config.queueId
  }

  public get spy(): JobSpyInterface<JobPayloadForQueue<Queues, QueueId>> {
    return this.queueManager.getSpy(this.queueId)
  }

  public async start(): Promise<void> {
    if (this.workId) return
    if (!this.startPromise) this.startPromise = this.internalStart()

    try {
      await this.startPromise
    } finally {
      this.startPromise = undefined
    }
  }

  /**
   * Stops fetching and waits for the batch in flight. Dispose processors before the manager: the
   * README on shutdown order has what the reverse order costs.
   */
  public async dispose(): Promise<void> {
    // A start still in flight would otherwise register its worker after this returned.
    if (this.startPromise) await Promise.allSettled([this.startPromise])
    if (!this.workId) return

    try {
      await this.queueManager.boss.offWork(this.queueId, { id: this.workId, wait: true })
    } catch {
      // the manager may already be stopped, which stopped this worker with it
    }
    this.workId = undefined
    this.monitor.unregisterQueueProcessor()
  }

  private async internalStart(): Promise<void> {
    if (!this.queueManager.isStarted && this.queueManager.config.lazyInitEnabled === false) {
      throw new Error('PgBossQueueManager is not started, please call `start` or enable lazy init')
    }
    await this.queueManager.start()
    this.monitor.registerQueueProcessor()

    // The literal `true`s are what make pg-boss's `WorkHandlerFor` pick the per-job handler
    // signature over `JobWithMetadata`; a plain `WorkOptions` widens both to boolean.
    const options: WorkOptions & { includeMetadata: true; perJobResults: true } = {
      ...this.config.workerOptions,
      ...(this.queueManager.config.isTest ? TEST_WORK_OPTIONS : {}),
      includeMetadata: true,
      perJobResults: true,
    }

    try {
      this.workId = await this.queueManager.boss.work<
        JobPayloadForQueue<Queues, QueueId>,
        unknown,
        typeof options
      >(this.queueId, options, async (jobs) => (jobs.length > 0 ? this.handleBatch(jobs) : []))
    } catch (error) {
      this.monitor.unregisterQueueProcessor()
      throw error
    }
  }

  /**
   * Settles a non-empty batch fetched by pg-boss. Every job needs exactly one result: pg-boss fails
   * a job left out of it, and throwing fails the whole batch.
   */
  protected abstract handleBatch(
    jobs: JobWithMetadata<JobPayloadForQueue<Queues, QueueId>>[],
  ): Promise<JobResult[]>

  /**
   * Replaces `job.data` with the parsed payload (the schema may apply defaults and transforms), or
   * returns the validation error.
   */
  protected parseJobPayload(
    job: JobWithMetadata<JobPayloadForQueue<Queues, QueueId>>,
  ): ZodError | undefined {
    const parsed = this.queueManager
      .getQueueConfig(this.queueId)
      .jobPayloadSchema.safeParse(job.data)
    if (!parsed.success) return parsed.error

    job.data = parsed.data as JobPayloadForQueue<Queues, QueueId>
    return undefined
  }

  /**
   * A payload that fails its schema fails it again on every retry, so the job skips its retries and
   * goes straight to the dead letter queue, carrying its validation issues as `output`.
   */
  protected deadLetterInvalidPayload(
    job: PgBossJob<unknown>,
    error: ZodError,
    requestContext: RequestContext,
  ): JobResult {
    requestContext.logger.error(
      { jobId: job.id, ...resolveGlobalErrorLogObject(error) },
      'Dead-lettering job with invalid payload',
    )
    this.monitor.reportError(error, job, requestContext)

    return {
      id: job.id,
      status: JOB_RESULT.DEADLETTER,
      output: { reason: 'Job payload failed schema validation', issues: error.issues },
    }
  }
}

/** This attempt is the job's last: if it fails, pg-boss has no retries left for it. */
export const isLastAttempt = (job: PgBossJob<unknown>): boolean => job.retryCount >= job.retryLimit
