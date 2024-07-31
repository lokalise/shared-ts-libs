import type {
  CommonLogger,
  RedisConfig,
  TransactionObservabilityManager,
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

export class BackgroundJobProcessorMonitor<
  JobPayload extends BaseJobPayload,
  JobType extends SafeJob<JobPayload>,
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
    if (!('requestContext' in job)) {
      const jobId = resolveJobId(job)
      const loggerChild = this.logger.child({
        'x-request-id': job.data.metadata.correlationId,
        jobId,
      })

      // @ts-ignore
      job.requestContext = {
        logger: new BackgroundJobProcessorLogger(loggerChild, job),
        reqId: jobId,
      }
    }

    // @ts-ignore
    return job.requestContext
  }

  public jobStart(job: JobType, requestContext: RequestContext): void {
    const jobId = resolveJobId(job)
    const transactionName = `bg_job:${this.ownerName}:${this.queueId}`
    this.transactionObservabilityManager.start(transactionName, jobId)
    requestContext.logger.info({ origin: this.processorName, jobId }, `Started job ${job.name}`)
  }

  public jobEnd(job: JobType, requestContext: RequestContext): void {
    const jobId = resolveJobId(job)
    requestContext.logger.info(
      {
        jobId,
        origin: this.processorName,
        isSuccess: job.progress === 100,
      },
      `Finished job ${job.name}`,
    )
    this.transactionObservabilityManager.stop(jobId)
  }
}
