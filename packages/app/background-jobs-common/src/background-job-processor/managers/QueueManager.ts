import type { Job, JobsOptions, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { Queue } from 'bullmq'
import type { JobState } from 'bullmq/dist/esm/types/job-type'
import { merge } from 'ts-deepmerge'
import type { z } from 'zod'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory'
import type { JobsPaginatedResponse, ProtectedQueue } from '../processors/types'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
import type { BaseJobPayload, BullmqProcessor } from '../types'
import { prepareJobOptions, sanitizeRedisConfig } from '../utils'
import type { JobRegistry } from './JobRegistry'
import type {
  JobDefinition,
  QueueConfiguration,
  QueueManagerConfig,
  SupportedQueues,
} from './types'

// Helper type to extract the inferred type from a Zod schema while preserving optionality
type InferExact<T extends z.ZodSchema> = T extends z.ZodObject<infer Shape>
  ? {
      [K in keyof Shape]: Shape[K] extends z.ZodTypeAny ? z.infer<Shape[K]> : never
    }
  : never

type JobPayloadForQueue<QueueId extends string, Jobs extends JobDefinition[]> = InferExact<
  Extract<Jobs[number], { queueId: QueueId }>['jobPayloadSchema']
>

type SupportedJobPayloads<Jobs extends JobDefinition[]> = z.infer<Jobs[number]['jobPayloadSchema']>

export class QueueManager<
  SupportedJobs extends JobDefinition[],
  QueueType extends Queue<
    SupportedJobPayloads<SupportedJobs>,
    void,
    string,
    SupportedJobPayloads<SupportedJobs>,
    void,
    string
  > = Queue<
    SupportedJobPayloads<SupportedJobs>,
    void,
    string,
    SupportedJobPayloads<SupportedJobs>,
    void,
    string
  >,
  QueueOptionsType extends QueueOptions = QueueOptions,
> {
  private readonly factory: AbstractBullmqFactory<
    QueueType,
    QueueOptionsType,
    Worker,
    WorkerOptions,
    BullmqProcessor<Job>,
    Job<SupportedJobPayloads<SupportedJobs>, void>,
    SupportedJobPayloads<SupportedJobs>,
    void
  >

  private readonly queueMap: Record<string, QueueConfiguration<QueueOptionsType>> = {}
  private readonly queueIds: Set<string>
  private config: QueueManagerConfig
  private readonly jobRegistry: JobRegistry<SupportedJobs>

  private _queues: Record<QueueConfiguration<QueueOptionsType>['queueId'], QueueType> = {}

  private readonly _spy?: BackgroundJobProcessorSpy<BaseJobPayload, undefined>

  private isStarted = false
  private startPromise?: Promise<void>

  protected constructor(
    factory: AbstractBullmqFactory<
      QueueType,
      QueueOptionsType,
      Worker,
      WorkerOptions,
      BullmqProcessor<Job>,
      Job<SupportedJobPayloads<SupportedJobs>>,
      SupportedJobPayloads<SupportedJobs>,
      void
    >,
    queues: QueueConfiguration<QueueOptionsType>[],
    jobRegistry: JobRegistry<SupportedJobs>,
    config: QueueManagerConfig,
  ) {
    this.factory = factory
    this.queueIds = new Set<string>()
    this.jobRegistry = jobRegistry

    for (const queue of queues) {
      this.queueIds.add(queue.queueId)
      this.queueMap[queue.queueId] = queue
    }

    this.config = config
    this._spy = config.isTest ? new BackgroundJobProcessorSpy() : undefined
  }

  public async dispose(): Promise<void> {
    if (!this.isStarted) return

    try {
      await Promise.allSettled(Object.values(this._queues).map((queue) => queue.close()))
      /* v8 ignore next 3 */
    } catch {
      //do nothing
    }

    this.isStarted = false
  }

  public getQueue<JobReturn>(
    queueId: SupportedQueues<SupportedJobs>,
  ): ProtectedQueue<SupportedJobPayloads<SupportedJobs>, JobReturn, QueueType> {
    if (!this._queues[queueId]) {
      throw new Error(`queue ${queueId} was not instantiated yet, please run "start()"`)
    }

    // @ts-ignore
    return this._queues[queueId]
  }

  public async start(queueIdsToStart?: string[]): Promise<void> {
    if (this.isStarted) return // if it is already started -> skip

    if (!this.startPromise) this.startPromise = this.internalStart(queueIdsToStart)
    await this.startPromise
    this.startPromise = undefined
  }

  private startIfNotStarted(
    queueId: QueueConfiguration<QueueOptionsType>['queueId'],
  ): Promise<void> {
    if (!this.isStarted && this.config.lazyInitEnabled === false) {
      throw new Error('QueueManager not started, please call `start` or enable lazy init')
    }

    if (!this.isStarted || !this._queues[queueId]) {
      return this.start([queueId])
    }

    return Promise.resolve()
  }

  private async internalStart(queueIdsToStart?: string[]): Promise<void> {
    const queuePromises = []
    const queueIdSetToStart = queueIdsToStart ? new Set(queueIdsToStart) : undefined

    for (const queueId of this.queueIds) {
      if (queueIdSetToStart?.has(queueId) === false) {
        continue
      }
      const queue = this.queueMap[queueId]
      const queueOptions = {
        ...((queue.queueOptions ?? {}) as QueueOptionsType),
        connection: sanitizeRedisConfig(this.config.redisConfig),
        prefix: this.config.redisConfig?.keyPrefix ?? undefined,
      }
      const queuePromise = this.factory.buildQueue(queueId, queueOptions)
      this._queues[queueId] = queuePromise
      queuePromises.push(queuePromise.waitUntilReady())
    }

    if (queuePromises.length) {
      await Promise.allSettled(queuePromises)
    }

    this.isStarted = true
  }

  public async getJobCount(queueId: SupportedQueues<SupportedJobs>): Promise<number> {
    await this.startIfNotStarted(queueId)
    return this.getQueue(queueId)?.getJobCountByTypes(
      'active',
      'waiting',
      'paused',
      'delayed',
      'prioritized',
      'waiting-children',
    )
  }

  public async schedule<QueueId extends SupportedQueues<SupportedJobs>>(
    queueId: QueueId,
    jobPayload: JobPayloadForQueue<QueueId, SupportedJobs>,
    options?: JobsOptions,
  ): Promise<string> {
    const schema = this.jobRegistry.getJobPayloadSchemaByQueue(queueId)
    const validatedPayload = schema.parse(jobPayload)
    const defaultJobOptions = this.jobRegistry.getJobOptions(queueId) ?? {}

    await this.startIfNotStarted(queueId)

    const job = await this.getQueue(queueId).add(
      queueId,
      validatedPayload,
      prepareJobOptions(this.config.isTest, merge(defaultJobOptions, options ?? {})),
    )
    if (!job?.id) throw new Error('Scheduled job ID is undefined')
    if (this._spy) this._spy.addJob(job, 'scheduled')

    return job.id
  }

  public async scheduleBulk<QueueId extends SupportedQueues<SupportedJobs>>(
    queueId: QueueId,
    jobPayloads: JobPayloadForQueue<QueueId, SupportedJobs>[],
    options?: JobsOptions,
  ): Promise<string[]> {
    if (jobPayloads.length === 0) return []

    const schema = this.jobRegistry.getJobPayloadSchemaByQueue(queueId)
    const validatedPayloads = jobPayloads.map((payload) => schema.parse(payload))

    const defaultJobOptions = this.jobRegistry.getJobOptions(queueId) ?? {}

    await this.startIfNotStarted(queueId)

    const jobs =
      (await this.getQueue(queueId)?.addBulk(
        validatedPayloads.map((data) => ({
          name: queueId,
          data: data,
          opts: prepareJobOptions(this.config.isTest, merge(defaultJobOptions, options ?? {})),
        })),
      )) ?? []

    const jobIds = jobs.map((job) => job.id)
    /* v8 ignore next 5 */
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
   * @param queueId
   * @param states
   * @param start default 0
   * @param end default 20
   * @param asc default true (oldest first)
   */
  public async getJobsInQueue<JobReturn = void>(
    queueId: SupportedQueues<SupportedJobs>,
    states: JobState[],
    start = 0,
    end = 20,
    asc = true,
  ): Promise<JobsPaginatedResponse<SupportedJobPayloads<SupportedJobs>, JobReturn>> {
    if (states.length === 0) throw new Error('states must not be empty')
    if (start > end) throw new Error('start must be less than or equal to end')

    await this.startIfNotStarted(queueId)

    const jobs =
      (await this.getQueue<JobReturn>(queueId)?.getJobs(states, start, end + 1, asc)) ?? []
    const expectedNumberOfJobs = 1 + (end - start)

    return {
      jobs: jobs.slice(0, expectedNumberOfJobs),
      hasMore: jobs.length > expectedNumberOfJobs,
    }
  }

  public get spy(): BackgroundJobProcessorSpyInterface<object, unknown> {
    if (!this._spy)
      throw new Error(
        'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
      )

    return this._spy
  }
}
