import {
  type CommonLogger,
  type RedisConfig,
  type TransactionObservabilityManager,
  resolveGlobalErrorLogObject,
} from '@lokalise/node-core'
import Redis from 'ioredis'
import { QUEUE_IDS_KEY } from '../constants'
import { BackgroundJobProcessorLogger } from '../logger/BackgroundJobProcessorLogger'
import type {
  BackgroundJobProcessorConfig,
  BackgroundJobProcessorDependencies,
} from '../processors/types'
import type { BaseJobPayload, RequestContext, SafeJob } from '../types'
import { resolveJobId, sanitizeRedisConfig } from '../utils'

const queueIdsSet = new Set<string>()

/**
 * Internal class to group and manage job processing monitoring tools.
 *
 * This class is responsible for managing and monitoring the lifecycle of background jobs, including
 * registering and unregistering job queues and creating request contexts, and logging main job events.
 * It utilizes observability tools and a logger to provide detailed insights.
 */
export class BackgroundJobProcessorMonitor<
  JobPayload extends BaseJobPayload = BaseJobPayload,
  JobType extends SafeJob<JobPayload> = SafeJob<JobPayload>,
> {
  private readonly logger: CommonLogger
  private readonly transactionObservabilityManager: TransactionObservabilityManager
  private readonly redisConfig: RedisConfig
  private readonly queueId: string
  private readonly ownerName: string
  private readonly processorName: string

  constructor(
    deps: Pick<
      BackgroundJobProcessorDependencies<JobPayload>,
      'logger' | 'transactionObservabilityManager'
    >,
    config: Pick<BackgroundJobProcessorConfig, 'redisConfig' | 'ownerName' | 'queueId'>,
    processorName: string,
  ) {
    this.transactionObservabilityManager = deps.transactionObservabilityManager
    this.logger = deps.logger
    this.queueId = config.queueId
    this.ownerName = config.ownerName
    this.redisConfig = config.redisConfig
    this.processorName = processorName
  }

  public async registerQueue(): Promise<void> {
    if (queueIdsSet.has(this.queueId)) throw new Error(`Queue id "${this.queueId}" is not unique.`)

    queueIdsSet.add(this.queueId)
    const redisWithoutPrefix = new Redis(sanitizeRedisConfig(this.redisConfig))
    await redisWithoutPrefix.zadd(QUEUE_IDS_KEY, Date.now(), this.queueId)
    redisWithoutPrefix.disconnect()
  }

  public unregisterQueue(): void {
    queueIdsSet.delete(this.queueId)
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
    const transactionName = `bg_job:${this.ownerName}:${this.queueId}`
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
      origin: this.processorName,
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
