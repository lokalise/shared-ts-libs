import {
  type CommonLogger,
  type ErrorReporter,
  resolveGlobalErrorLogObject,
  runInTransactionContext,
  type TransactionObservabilityManager,
} from '@lokalise/node-core'
import type { JobWithMetadata } from 'pg-boss'
import { stdSerializers } from 'pino'
import { isMutedUnrecoverableJobError, normalizeError } from '../errors/utils.ts'
import type { RequestContext } from '../types.ts'

const queueIdsWithActiveProcessors = new Set<string>()

type MonitorDependencies = {
  logger: CommonLogger
  errorReporter: ErrorReporter
  transactionObservabilityManager: TransactionObservabilityManager
}

type MonitorConfig = {
  queueId: string
  ownerName: string
  processorName: string
}

/**
 * Logging, error reporting and transaction tracing for a processor, with the transaction names,
 * log messages and error report context `@lokalise/background-jobs-common` uses, so dashboards and
 * monitors built on one keep working for the other.
 */
export class PgBossProcessorMonitor {
  private readonly logger: CommonLogger
  private readonly errorReporter: ErrorReporter
  private readonly transactionObservabilityManager: TransactionObservabilityManager
  private readonly config: MonitorConfig

  constructor(dependencies: MonitorDependencies, config: MonitorConfig) {
    this.logger = dependencies.logger
    this.errorReporter = dependencies.errorReporter
    this.transactionObservabilityManager = dependencies.transactionObservabilityManager
    this.config = config
  }

  registerQueueProcessor(): void {
    if (queueIdsWithActiveProcessors.has(this.config.queueId)) {
      throw new Error(`Processor for queue id "${this.config.queueId}" is not unique.`)
    }
    queueIdsWithActiveProcessors.add(this.config.queueId)
  }

  unregisterQueueProcessor(): void {
    queueIdsWithActiveProcessors.delete(this.config.queueId)
  }

  /**
   * Runs before the payload is validated, so `data` may be anything: a job sent from outside the
   * manager, such as a dead letter redrive or a producer on an older schema, can lack `metadata`.
   */
  buildJobRequestContext(job: JobWithMetadata<unknown>): RequestContext {
    const reqId = resolveCorrelationId(job.data) ?? job.id

    return {
      reqId,
      logger: this.logger.child({ jobId: job.id, jobName: job.name, 'x-request-id': reqId }),
    }
  }

  /**
   * One context for a whole batch, tagged with the first correlation id the batch carries (or the
   * first job id when none does). Every job id and correlation id is bound to the logger, so a log
   * line can be traced back through any of them.
   */
  buildBatchRequestContext(jobs: JobWithMetadata<unknown>[]): RequestContext {
    const correlationIds = jobs.flatMap((job) => resolveCorrelationId(job.data) ?? [])
    // biome-ignore lint/style/noNonNullAssertion: a batch is never empty
    const reqId = correlationIds[0] ?? jobs[0]!.id

    return {
      reqId,
      logger: this.logger.child({
        jobIds: jobs.map((job) => job.id),
        jobName: this.config.queueId,
        'x-request-id': reqId,
        'x-request-ids': correlationIds,
      }),
    }
  }

  /**
   * Runs `fn` as one `bg_job:<ownerName>:<queueId>` transaction, so spans it produces become
   * children of the job instead of detached roots. The transaction fails when `fn` reports it did.
   */
  async runInTransaction<T>(
    transactionKey: string,
    fn: () => Promise<{ result: T; isSuccess: boolean }>,
  ): Promise<T> {
    this.transactionObservabilityManager.start(
      `bg_job:${this.config.ownerName}:${this.config.queueId}`,
      transactionKey,
    )
    let isSuccess = false
    try {
      const outcome = await runInTransactionContext(
        this.transactionObservabilityManager,
        transactionKey,
        fn,
      )
      isSuccess = outcome.isSuccess

      return outcome.result
    } finally {
      this.transactionObservabilityManager.stop(transactionKey, isSuccess)
    }
  }

  logStart(requestContext: RequestContext, extra?: Record<string, unknown>): void {
    requestContext.logger.info(
      { origin: this.config.processorName, ...extra },
      `Started job ${this.config.queueId}`,
    )
  }

  logAttemptError(requestContext: RequestContext, error: unknown): void {
    requestContext.logger.error(
      { origin: this.config.processorName, ...resolveGlobalErrorLogObject(error) },
      `${this.config.queueId} try failed`,
    )
  }

  logEnd(
    requestContext: RequestContext,
    isSuccess: boolean,
    extra?: Record<string, unknown>,
  ): void {
    requestContext.logger.info(
      { origin: this.config.processorName, isSuccess, ...extra },
      `Finished job ${this.config.queueId}`,
    )
  }

  /** Sends the error to the error reporter, unless it is a `MutedUnrecoverableError`. */
  reportError(error: unknown, job: JobWithMetadata<unknown>, requestContext: RequestContext): void {
    if (isMutedUnrecoverableJobError(error)) return

    const normalized = normalizeError(error)
    this.errorReporter.report({
      error: normalized,
      context: {
        jobId: job.id,
        jobName: job.name,
        'x-request-id': requestContext.reqId,
        errorJson: JSON.stringify(stdSerializers.err(normalized)),
      },
    })
  }
}

function resolveCorrelationId(data: unknown): string | undefined {
  const correlationId = (data as { metadata?: { correlationId?: unknown } } | null | undefined)
    ?.metadata?.correlationId

  return typeof correlationId === 'string' ? correlationId : undefined
}
