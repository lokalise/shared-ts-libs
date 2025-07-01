import {
  type CommonLogger,
  type RedisConfig,
  resolveGlobalErrorLogObject,
  type TransactionObservabilityManager,
} from '@lokalise/node-core'
import { BackgroundJobProcessorLogger } from '../logger/BackgroundJobProcessorLogger.ts'
import type { BackgroundJobProcessorDependencies } from '../processors/types.ts'
import type { BaseJobPayload, RequestContext, SafeJob } from '../types.ts'
import { resolveJobId } from '../utils.ts'
import { registerActiveQueueIds } from './registerActiveQueueIds.ts'

const queueIdsWithActiveProcessorsSet = new Set<string>()

type BackgroundJobProcessorMonitorConfig = {
  queueId: string
  ownerName: string
  processorName: string
} & (
  | {
      isNewProcessor: true
    }
  | {
      isNewProcessor: false
      redisConfig: RedisConfig
    }
)

/**
 * Internal class to group and manage job processing monitoring tools.
 *
 * This class is responsible for managing and monitoring the lifecycle of background jobs, including
 * registering and unregistering job queues and creating request contexts, and logging main job events.
 * It utilizes observability tools and a logger to provide detailed insights.
 */
export class BackgroundJobProcessorMonitor<
  JobType extends SafeJob<BaseJobPayload> = SafeJob<BaseJobPayload>,
> {
  private readonly logger: CommonLogger
  private readonly transactionObservabilityManager: TransactionObservabilityManager
  private readonly config: BackgroundJobProcessorMonitorConfig

  constructor(
    deps: Pick<
      BackgroundJobProcessorDependencies<BaseJobPayload>,
      'logger' | 'transactionObservabilityManager'
    >,
    config: BackgroundJobProcessorMonitorConfig,
  ) {
    this.transactionObservabilityManager = deps.transactionObservabilityManager
    this.logger = deps.logger
    this.config = config
  }

  public async registerQueueProcessor(): Promise<void> {
    if (queueIdsWithActiveProcessorsSet.has(this.config.queueId)) {
      throw new Error(`Processor for queue id "${this.config.queueId}" is not unique.`)
    }
    queueIdsWithActiveProcessorsSet.add(this.config.queueId)

    if (this.config.isNewProcessor) return Promise.resolve()
    // For new processors, queue registration in redis is handled by queue manager
    // (once we get rid of the old one, we can remove this code)
    await registerActiveQueueIds(this.config.redisConfig, [this.config])
  }

  public unregisterQueueProcessor(): void {
    queueIdsWithActiveProcessorsSet.delete(this.config.queueId)
  }

  public getRequestContext(job: JobType): RequestContext {
    // try to reuse request context if it's already attached to the job
    if (hasRequestContext(job)) return job.requestContext
    // if not creating it and attaching to the job for next time

    const jobId = resolveJobId(job)
    const requestContext: RequestContext = {
      reqId: jobId,
      logger: new BackgroundJobProcessorLogger(
        this.logger.child({
          'x-request-id': job.data.metadata.correlationId,
          jobId,
          jobName: job.name,
        }),
        job,
      ),
    }

    // @ts-ignore
    job.requestContext = requestContext

    return requestContext
  }

  public jobStart(job: JobType, requestContext: RequestContext): void {
    const transactionName = `bg_job:${this.config.ownerName}:${this.config.queueId}`
    this.transactionObservabilityManager.start(transactionName, resolveJobId(job))
    requestContext.logger.info(this.buildLogParams(job), `Started job ${job.name}`)
  }

  public jobAttemptError(job: JobType, error: unknown, requestContext: RequestContext): void {
    requestContext.logger.error(this.buildLogParams(job, error), `${job.name} try failed`)
  }

  public jobEnd(job: JobType, requestContext: RequestContext): void {
    requestContext.logger.info(
      {
        ...this.buildLogParams(job),
        isSuccess: job.progress === 100,
      },
      `Finished job ${job.name}`,
    )
    this.transactionObservabilityManager.stop(resolveJobId(job))
  }

  private buildLogParams(job: JobType, error?: unknown) {
    return {
      origin: this.config.processorName,
      jobProgress: job.progress,
      ...(error ? resolveGlobalErrorLogObject(error) : {}),
    }
  }
}

const hasRequestContext = <T extends object>(
  job: T,
): job is T & { requestContext: RequestContext } => {
  return (
    'requestContext' in job &&
    typeof job.requestContext === 'object' &&
    job.requestContext !== null &&
    'logger' in job.requestContext &&
    'reqId' in job.requestContext &&
    typeof job.requestContext.reqId === 'string' &&
    typeof job.requestContext.logger === 'object'
  )
}
