import type { JobState, JobsOptions, Queue, QueueOptions } from 'bullmq'
import { merge } from 'ts-deepmerge'
import { DEFAULT_QUEUE_OPTIONS } from '../constants.js'
import type { BullmqQueueFactory } from '../factories/BullmqQueueFactory.js'
import type { JobsPaginatedResponse, ProtectedQueue } from '../processors/types.js'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy.js'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types.js'
import { prepareJobOptions, sanitizeRedisConfig } from '../utils.js'
import { QueueRegistry } from './QueueRegistry.js'
import type {
  JobPayloadForQueue,
  JobPayloadInputForQueue,
  QueueConfiguration,
  QueueManagerConfig,
  SupportedJobPayloads,
  SupportedQueueIds,
} from './types.js'

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
  public readonly config: QueueManagerConfig

  protected readonly queueRegistry: QueueRegistry<Queues, QueueOptionsType, JobOptionsType>

  private readonly factory: BullmqQueueFactory<QueueType, QueueOptionsType>
  private readonly _queues: Record<QueueConfiguration<QueueOptionsType>['queueId'], QueueType> = {}
  private readonly spies: Record<
    QueueConfiguration<QueueOptionsType>['queueId'],
    BackgroundJobProcessorSpy<
      JobPayloadForQueue<Queues, QueueConfiguration<QueueOptionsType>['queueId']>,
      // biome-ignore lint/suspicious/noExplicitAny: At this point we don't know the return type of the spy
      any
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

  /**
   * Start the queues
   * @param enabled default true - if true, start all queues, if false, do nothing, if array, start only the queues in the array (array of queue names expected)
   */
  public async start(enabled: string[] | boolean = true): Promise<void> {
    if (this.isStarted) return // if it is already started -> skip

    if (enabled === false) return // if it is disabled -> skip

    if (!this.startPromise) this.startPromise = this.internalStart(enabled)
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

  private async internalStart(enabled: string[] | true): Promise<void> {
    const queueReadyPromises = []
    const queueIdSetToStart = enabled === true ? undefined : new Set(enabled)

    for (const queueId of this.queueRegistry.queueIds) {
      if (queueIdSetToStart?.has(queueId) === false) {
        continue
      }
      const queueConfig = this.queueRegistry.getQueueConfig(queueId)
      const queue = this.factory.buildQueue(queueId, {
        ...(merge(DEFAULT_QUEUE_OPTIONS, queueConfig.queueOptions ?? {}) as QueueOptionsType),
        connection: sanitizeRedisConfig(this.config.redisConfig),
        prefix: this.config.redisConfig?.keyPrefix ?? undefined,
      })
      this._queues[queueId] = queue
      queueReadyPromises.push(queue.waitUntilReady())
    }

    if (queueReadyPromises.length) await Promise.all(queueReadyPromises)

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
    jobPayload: JobPayloadInputForQueue<Queues, QueueId>,
    options?: JobOptionsType,
  ): Promise<string> {
    const parsedPayload = this.queueRegistry
      .getQueueConfig(queueId)
      .jobPayloadSchema.parse(jobPayload)

    await this.startIfNotStarted(queueId)
    const job = await this.getQueue(queueId).add(
      queueId,
      parsedPayload,
      this.resolveJobOptions(queueId, parsedPayload, options),
    )
    if (!job?.id) throw new Error('Scheduled job ID is undefined')
    if (this.spies[queueId]) this.spies[queueId].addJob(job, 'scheduled')

    return job.id
  }

  public async scheduleBulk<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayloads: JobPayloadInputForQueue<Queues, QueueId>[],
    options?: Omit<JobOptionsType, 'repeat'>,
  ): Promise<string[]> {
    if (jobPayloads.length === 0) return []

    const { jobPayloadSchema } = this.queueRegistry.getQueueConfig(queueId)
    const parsedPayload = jobPayloads.map((payload) => jobPayloadSchema.parse(payload))

    await this.startIfNotStarted(queueId)
    const jobs =
      (await this.getQueue(queueId)?.addBulk(
        parsedPayload.map((data) => ({
          name: queueId,
          data: data,
          opts: this.resolveJobOptions(queueId, data, options as JobOptionsType),
        })),
      )) ?? []

    const jobIds = jobs.map((job) => job.id)
    /* v8 ignore start */
    if (jobIds.length === 0 || !jobIds.every((id) => !!id)) {
      // Practically unreachable, but we want to simplify the signature of the method and avoid
      // stating that it could return undefined.
      throw new Error('Some scheduled job IDs are undefined')
    }
    /* v8 ignore stop */
    if (this.spies[queueId]) this.spies[queueId].addJobs(jobs, 'scheduled')

    return jobIds as string[]
  }

  private resolveJobOptions<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
    jobPayload: JobPayloadForQueue<Queues, QueueId>,
    options?: JobOptionsType,
  ): JobOptionsType {
    const defaultOptions = this.queueRegistry.getQueueConfig(queueId).jobOptions
    const resolvedOptions: JobOptionsType = merge(
      defaultOptions ?? {},
      options ?? {},
    ) as JobOptionsType

    if (defaultOptions?.deduplication && !options?.deduplication) {
      const deduplicationId = defaultOptions.deduplication.idBuilder(jobPayload)
      if (!deduplicationId || deduplicationId.trim().length === 0) {
        throw new Error('Invalid deduplication id')
      }

      resolvedOptions.deduplication = {
        ...resolvedOptions.deduplication,
        id: deduplicationId,
      }
    }

    return prepareJobOptions(this.config.isTest, resolvedOptions)
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

  public getSpy<QueueId extends SupportedQueueIds<Queues>, JobReturn = unknown>(
    queueId: QueueId,
  ): BackgroundJobProcessorSpyInterface<JobPayloadForQueue<Queues, QueueId>, JobReturn> {
    if (!this.spies[queueId])
      throw new Error(
        `${queueId} spy was not instantiated, it is only available on test mode. Please use \`config.isTest\` to enable it on QueueManager`,
      )

    return this.spies[queueId]
  }
}
