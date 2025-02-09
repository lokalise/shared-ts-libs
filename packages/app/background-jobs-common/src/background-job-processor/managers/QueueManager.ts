import type { Job, JobsOptions, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { Queue } from 'bullmq'
import type { JobState } from 'bullmq/dist/esm/types/job-type'
import { merge } from 'ts-deepmerge'
import type { AbstractBullmqFactory } from '../factories/AbstractBullmqFactory'
import type { JobsPaginatedResponse, ProtectedQueue } from '../processors/types'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
import type { BaseJobPayload, BullmqProcessor } from '../types'
import { prepareJobOptions, sanitizeRedisConfig } from '../utils'
import { QueueRegistry } from './QueueRegistry'
import type {
  JobPayloadForQueue,
  QueueConfiguration,
  QueueManagerConfig,
  SupportedJobPayloads,
  SupportedQueueIds,
} from './types'

export class QueueManager<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  JobOptionsType extends JobsOptions = JobsOptions,
  QueueType extends Queue<
    SupportedJobPayloads<Queues>,
    unknown,
    string,
    SupportedJobPayloads<Queues>,
    unknown,
    string
  > = Queue<
    SupportedJobPayloads<Queues>,
    unknown,
    string,
    SupportedJobPayloads<Queues>,
    unknown,
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
    Job<SupportedJobPayloads<Queues>, unknown>,
    SupportedJobPayloads<Queues>,
    unknown
  >
  private readonly queueRegistry: QueueRegistry<Queues, QueueOptionsType, JobOptionsType>
  private config: QueueManagerConfig

  private readonly _queues: Record<QueueConfiguration<QueueOptionsType>['queueId'], QueueType> = {}
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
      Job<SupportedJobPayloads<Queues>, unknown>,
      SupportedJobPayloads<Queues>,
      unknown
    >,
    queues: Queues,
    config: QueueManagerConfig,
  ) {
    this.factory = factory
    this.queueRegistry = new QueueRegistry(queues)

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

  public getQueue<QueueId extends string, JobReturn = unknown>(
    queueId: QueueId,
  ): ProtectedQueue<JobPayloadForQueue<QueueId, Queues>, JobReturn, QueueType> {
    if (!this._queues[queueId]) {
      throw new Error(`queue ${queueId} was not instantiated yet, please run "start()"`)
    }

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

    for (const queueId of this.queueRegistry.queueIds) {
      if (queueIdSetToStart?.has(queueId) === false) {
        continue
      }
      const queue = this.queueRegistry.getQueueConfig(queueId)
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

  public async getJobCount(queueId: SupportedQueueIds<Queues>): Promise<number> {
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

  public async schedule<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayload: JobPayloadForQueue<QueueId, Queues>,
    options?: JobsOptions,
  ): Promise<string> {
    const { jobOptions: defaultOptions, jobPayloadSchema } =
      this.queueRegistry.getQueueConfig(queueId)

    const validatedPayload = jobPayloadSchema.parse(jobPayload)

    await this.startIfNotStarted(queueId)

    const job = await this.getQueue(queueId).add(
      queueId,
      validatedPayload,
      prepareJobOptions(this.config.isTest, merge(defaultOptions ?? {}, options ?? {})),
    )
    if (!job?.id) throw new Error('Scheduled job ID is undefined')
    if (this._spy) this._spy.addJob(job, 'scheduled')

    return job.id
  }

  public async scheduleBulk<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayloads: JobPayloadForQueue<QueueId, Queues>[],
    options?: JobsOptions,
  ): Promise<string[]> {
    if (jobPayloads.length === 0) return []

    const { jobOptions: defaultOptions, jobPayloadSchema } =
      this.queueRegistry.getQueueConfig(queueId)
    const validatedPayloads = jobPayloads.map((payload) => jobPayloadSchema.parse(payload))

    await this.startIfNotStarted(queueId)

    const jobs =
      (await this.getQueue(queueId)?.addBulk(
        validatedPayloads.map((data) => ({
          name: queueId,
          data: data,
          opts: prepareJobOptions(this.config.isTest, merge(defaultOptions ?? {}, options ?? {})),
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
  public async getJobsInQueue<QueueId extends string, JobReturn = unknown>(
    queueId: QueueId,
    states: JobState[],
    start = 0,
    end = 20,
    asc = true,
  ): Promise<JobsPaginatedResponse<JobPayloadForQueue<QueueId, Queues>, JobReturn>> {
    if (states.length === 0) throw new Error('states must not be empty')
    if (start > end) throw new Error('start must be less than or equal to end')

    await this.startIfNotStarted(queueId)

    const queue = this.getQueue<QueueId, JobReturn>(queueId)
    if (!queue) return { jobs: [], hasMore: false }

    const jobs = await queue.getJobs(states, start, end + 1, asc)
    const expectedNumberOfJobs = 1 + (end - start)

    return {
      // @ts-expect-error: JobReturn is unknown at this point
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
