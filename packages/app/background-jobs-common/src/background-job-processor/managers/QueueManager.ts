import type { JobsOptions, QueueOptions } from 'bullmq'
import type { Queue } from 'bullmq'
import type { JobState } from 'bullmq/dist/esm/types/job-type'
import { merge } from 'ts-deepmerge'
import type { BullmqQueueFactory } from '../factories/BullmqQueueFactory'
import type { JobsPaginatedResponse, ProtectedQueue } from '../processors/types'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
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
  QueueType extends Queue<
    SupportedJobPayloads<Queues>,
    unknown,
    string,
    SupportedJobPayloads<Queues>,
    unknown,
    string
  > = Queue<SupportedJobPayloads<Queues>, void, string, SupportedJobPayloads<Queues>, void, string>,
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> {
  protected readonly queueRegistry: QueueRegistry<Queues, QueueOptionsType, JobOptionsType>

  private readonly factory: BullmqQueueFactory<QueueType, QueueOptionsType>
  private config: QueueManagerConfig

  private readonly _queues: Record<QueueConfiguration<QueueOptionsType>['queueId'], QueueType> = {}
  private readonly spies: Record<
    QueueConfiguration<QueueOptionsType>['queueId'],
    BackgroundJobProcessorSpy<
      JobPayloadForQueue<Queues, QueueConfiguration<QueueOptionsType>['queueId']>,
      undefined
    >
  > = {}

  private isStarted = false
  private startPromise?: Promise<void>

  constructor(
    queueFactory: BullmqQueueFactory<QueueType, QueueOptionsType>,
    queues: Queues,
    config: QueueManagerConfig,
  ) {
    this.factory = queueFactory
    this.queueRegistry = new QueueRegistry(queues)

    this.config = config
    if (config.isTest) {
      for (const queue of queues) {
        this.spies[queue.queueId] = new BackgroundJobProcessorSpy()
      }
    }
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

  public getQueue<QueueId extends SupportedQueueIds<Queues>, JobReturn = unknown>(
    queueId: QueueId,
  ): ProtectedQueue<JobPayloadForQueue<Queues, QueueId>, JobReturn, QueueType> {
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
    jobPayload: JobPayloadForQueue<Queues, QueueId>,
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
    if (this.spies[queueId]) this.spies[queueId].addJob(job, 'scheduled')

    return job.id
  }

  public async scheduleBulk<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayloads: JobPayloadForQueue<Queues, QueueId>[],
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
    if (this.spies[queueId]) this.spies[queueId].addJobs(jobs, 'scheduled')

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
  public async getJobsInQueue<QueueId extends SupportedQueueIds<Queues>, JobReturn = unknown>(
    queueId: QueueId,
    states: JobState[],
    start = 0,
    end = 20,
    asc = true,
  ): Promise<JobsPaginatedResponse<JobPayloadForQueue<Queues, QueueId>, JobReturn>> {
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

  public getSpy<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
  ): BackgroundJobProcessorSpyInterface<JobPayloadForQueue<Queues, QueueId>, undefined> {
    if (!this.spies[queueId])
      throw new Error(
        `${queueId} spy was not instantiated, it is only available on test mode. Please use \`config.isTest\` to enable it.`,
      )

    return this.spies[queueId]
  }
}
