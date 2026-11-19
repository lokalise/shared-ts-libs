import { resolveGlobalErrorLogObject } from '@lokalise/node-core'
import type { JobResult } from 'pg-boss'
import { isUnrecoverableJobError, normalizeError } from '../errors/utils.ts'
import type { JobPayloadForQueue, QueueConfiguration, SupportedQueueIds } from '../queues/types.ts'
import type { RequestContext } from '../types.ts'
import { AbstractPgBossProcessor, isLastAttempt, JOB_RESULT } from './AbstractPgBossProcessor.ts'
import type {
  PgBossJob,
  PgBossJobProcessorConfig,
  PgBossJobProcessorDependencies,
} from './types.ts'

/**
 * Processes one job at a time, the way `AbstractBackgroundJobProcessorNew` does in
 * `@lokalise/background-jobs-common`. With a `batchSize` above 1 the jobs of a batch run
 * concurrently, each with its own request context, transaction and outcome.
 *
 * A job that throws is retried per the queue's retry settings. Throwing an `UnrecoverableError`
 * sends it straight to the dead letter queue instead. The error reaches the error reporter, and
 * `onFailed` runs, once the job is out of retries.
 */
export abstract class AbstractPgBossJobProcessor<
  Queues extends readonly QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues>,
  JobReturn = void,
> extends AbstractPgBossProcessor<Queues, QueueId> {
  protected constructor(
    dependencies: PgBossJobProcessorDependencies<Queues>,
    config: PgBossJobProcessorConfig<QueueId>,
  ) {
    super(dependencies, config)
  }

  protected handleBatch(
    jobs: PgBossJob<JobPayloadForQueue<Queues, QueueId>>[],
  ): Promise<JobResult[]> {
    return Promise.all(jobs.map((job) => this.handleJob(job)))
  }

  private handleJob(job: PgBossJob<JobPayloadForQueue<Queues, QueueId>>): Promise<JobResult> {
    const requestContext = this.monitor.buildJobRequestContext(job)

    return this.monitor.runInTransaction(job.id, async () => {
      this.monitor.logStart(requestContext)
      const result = await this.settleJob(job, requestContext)
      const isSuccess = result.status === JOB_RESULT.COMPLETED
      this.monitor.logEnd(requestContext, isSuccess)

      return { result, isSuccess }
    })
  }

  private async settleJob(
    job: PgBossJob<JobPayloadForQueue<Queues, QueueId>>,
    requestContext: RequestContext,
  ): Promise<JobResult> {
    const validationError = this.parseJobPayload(job)
    if (validationError) return this.deadLetterInvalidPayload(job, validationError, requestContext)

    try {
      const output = await this.process(job, requestContext)
      await this.runHook(job, requestContext, () => this.onSuccess(job, requestContext))

      return { id: job.id, status: JOB_RESULT.COMPLETED, output }
    } catch (rawError) {
      const error = normalizeError(rawError)
      this.monitor.logAttemptError(requestContext, error)

      const isUnrecoverable = isUnrecoverableJobError(error)
      if (isUnrecoverable || isLastAttempt(job)) {
        this.monitor.reportError(error, job, requestContext)
        await this.runHook(job, requestContext, () => this.onFailed(job, error, requestContext))
      }

      // pg-boss stores the output on the job row, and keeps it when the job moves to the dead letter
      // queue, so the reason the job failed stays with it.
      return {
        id: job.id,
        status: isUnrecoverable ? JOB_RESULT.DEADLETTER : JOB_RESULT.FAILED,
        output: error,
      }
    }
  }

  /** A hook that throws is logged and reported, and leaves the job's outcome as it was. */
  private async runHook(
    job: PgBossJob<JobPayloadForQueue<Queues, QueueId>>,
    requestContext: RequestContext,
    hook: () => Promise<void>,
  ): Promise<void> {
    try {
      await hook()
    } catch (error) {
      requestContext.logger.error(resolveGlobalErrorLogObject(error, job.id))
      this.monitor.reportError(error, job, requestContext)
    }
  }

  protected abstract process(
    job: PgBossJob<JobPayloadForQueue<Queues, QueueId>>,
    requestContext: RequestContext,
  ): Promise<JobReturn>

  /**
   * Runs after `process` succeeds. pg-boss marks the job completed once the batch it belongs to has
   * been handled, so the job is still `active` while this runs.
   */
  protected onSuccess(
    _job: PgBossJob<JobPayloadForQueue<Queues, QueueId>>,
    _requestContext: RequestContext,
  ): Promise<void> {
    return Promise.resolve()
  }

  /** Runs once the job has failed for good: out of retries, or failed with an `UnrecoverableError`. */
  protected onFailed(
    _job: PgBossJob<JobPayloadForQueue<Queues, QueueId>>,
    _error: Error,
    _requestContext: RequestContext,
  ): Promise<void> {
    return Promise.resolve()
  }
}
