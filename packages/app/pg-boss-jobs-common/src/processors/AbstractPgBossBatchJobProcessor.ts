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

/** The jobs a batch could not handle, keyed by job id, each with the error that stopped it. */
export type FailedJobs = ReadonlyMap<string, Error>

/**
 * How `process` settled its batch. Between them the two fields account for every job in the
 * batch, so each job is settled on a verdict `process` stated rather than one inferred from
 * silence. Build one with {@link allJobsSucceeded} or {@link someJobsFailed}.
 */
export type BatchOutcome = {
  succeededJobIds: readonly string[]
  failedJobs: FailedJobs
}

const NO_FAILED_JOBS: FailedJobs = new Map()

/** The whole batch went through. */
export function allJobsSucceeded(jobs: readonly { id: string }[]): BatchOutcome {
  return { succeededJobIds: jobs.map((job) => job.id), failedJobs: NO_FAILED_JOBS }
}

/** The jobs in `failedJobs` failed; every other job of `jobs` succeeded. */
export function someJobsFailed(
  jobs: readonly { id: string }[],
  failedJobs: FailedJobs,
): BatchOutcome {
  return {
    succeededJobIds: jobs.filter((job) => !failedJobs.has(job.id)).map((job) => job.id),
    failedJobs,
  }
}

type ResolvedBatchOutcome = {
  outcome: BatchOutcome
  /**
   * Stored as the `output` of every failed job in place of its own error. pg-boss serializes one
   * copy per job, so a batch-wide failure keeps a short summary rather than N copies of one error.
   * The error itself still reaches the logger and the error reporter.
   */
  sharedOutput?: { name: string; message: string }
}

/**
 * Hands `process` the whole batch pg-boss fetched, for work that is cheaper in bulk (one bulk
 * write for N jobs), and settles each job of the batch on its own verdict, so one bad job cannot
 * fail the rest. The batch shares one request context and one transaction.
 *
 * See the README on batch processing for how to write `process`.
 */
export abstract class AbstractPgBossBatchJobProcessor<
  Queues extends readonly QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues>,
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
    const requestContext = this.monitor.buildBatchRequestContext(jobs)

    // biome-ignore lint/style/noNonNullAssertion: a batch is never empty
    return this.monitor.runInTransaction(jobs[0]!.id, async () => {
      this.monitor.logStart(requestContext, { jobCount: jobs.length })

      const validJobs: PgBossJob<JobPayloadForQueue<Queues, QueueId>>[] = []
      const results: JobResult[] = []
      for (const job of jobs) {
        const validationError = this.parseJobPayload(job)
        if (validationError) {
          results.push(this.deadLetterInvalidPayload(job, validationError, requestContext))
        } else {
          validJobs.push(job)
        }
      }
      if (validJobs.length > 0) results.push(...(await this.settleJobs(validJobs, requestContext)))

      const succeededJobCount = results.filter(
        (result) => result.status === JOB_RESULT.COMPLETED,
      ).length
      const isSuccess = succeededJobCount === jobs.length
      this.monitor.logEnd(requestContext, isSuccess, {
        succeededJobCount,
        failedJobCount: jobs.length - succeededJobCount,
      })

      return { result: results, isSuccess }
    })
  }

  /**
   * One disposition per job: succeeded jobs complete, failed jobs fail (and so retry or
   * dead-letter per queue config) carrying their own error as `output`. A job failed with an
   * `UnrecoverableError` skips its retries. A failed job reaches the error reporter only once it
   * is out of retries.
   */
  private async settleJobs(
    validJobs: PgBossJob<JobPayloadForQueue<Queues, QueueId>>[],
    requestContext: RequestContext,
  ): Promise<JobResult[]> {
    const { outcome, sharedOutput } = await this.resolveBatchOutcome(validJobs, requestContext)
    const jobsById = new Map(validJobs.map((job) => [job.id, job]))

    const completed = outcome.succeededJobIds.map((jobId) => ({
      id: jobId,
      status: JOB_RESULT.COMPLETED,
    }))
    const failed = [...outcome.failedJobs].map(([jobId, error]) => {
      // biome-ignore lint/style/noNonNullAssertion: assertOutcomeCoversBatch checked the ids
      const job = jobsById.get(jobId)!
      const isUnrecoverable = isUnrecoverableJobError(error)
      if (isUnrecoverable || isLastAttempt(job)) {
        this.monitor.reportError(error, job, requestContext)
      }

      return {
        id: jobId,
        status: isUnrecoverable ? JOB_RESULT.DEADLETTER : JOB_RESULT.FAILED,
        output: sharedOutput ?? error,
      }
    })

    return [...completed, ...failed]
  }

  private async resolveBatchOutcome(
    validJobs: PgBossJob<JobPayloadForQueue<Queues, QueueId>>[],
    requestContext: RequestContext,
  ): Promise<ResolvedBatchOutcome> {
    try {
      const outcome = await this.process(validJobs, requestContext)
      assertOutcomeCoversBatch(outcome, validJobs)
      if (outcome.failedJobs.size > 0) {
        requestContext.logger.error(
          {
            failedJobIds: [...outcome.failedJobs.keys()],
            succeededJobCount: outcome.succeededJobIds.length,
          },
          'Some jobs in the batch failed',
        )
      }

      return { outcome }
    } catch (rawError) {
      // No per-job verdict came back, so the failure is batch-wide and every job fails with it.
      const error = normalizeError(rawError)
      this.monitor.logAttemptError(requestContext, error)

      return {
        outcome: {
          succeededJobIds: [],
          failedJobs: new Map(validJobs.map((job) => [job.id, error])),
        },
        sharedOutput: { name: error.name, message: error.message },
      }
    }
  }

  /**
   * Processes the jobs of a batch whose payloads passed validation, and reports how it went:
   * {@link allJobsSucceeded} for a batch that went through, or {@link someJobsFailed} with the jobs
   * a failure can be pinned on, which fails those alone and completes the rest.
   *
   * Throw when the failure cannot be pinned on individual jobs (the store is down, the read that
   * feeds every job failed), and the whole batch fails.
   */
  protected abstract process(
    jobs: PgBossJob<JobPayloadForQueue<Queues, QueueId>>[],
    requestContext: RequestContext,
  ): Promise<BatchOutcome>
}

/**
 * Every job in the batch needs exactly one verdict. pg-boss ignores an id it never handed out and
 * fails a job nobody reported, so an outcome that does not line up with the batch loses what
 * `process` meant: a failure map keyed by anything but `job.id` would complete the very jobs it
 * meant to fail. Throwing turns that into the batch-wide failure it is.
 */
function assertOutcomeCoversBatch(outcome: BatchOutcome, validJobs: { id: string }[]): void {
  const awaitingVerdict = new Set(validJobs.map((job) => job.id))
  // `delete` returns false both for an id outside the batch and for one already reported.
  const unexpectedJobIds = [...outcome.succeededJobIds, ...outcome.failedJobs.keys()].filter(
    (jobId) => !awaitingVerdict.delete(jobId),
  )
  if (unexpectedJobIds.length === 0 && awaitingVerdict.size === 0) return

  throw new Error(
    `process returned an outcome that does not match its batch: unknown or repeated job ids [${unexpectedJobIds.join(', ')}], jobs left without a verdict [${[...awaitingVerdict].join(', ')}]`,
  )
}
