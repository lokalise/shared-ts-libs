import type { JobState, JobsOptions, Queue, QueueOptions } from 'bullmq'
import { merge } from 'ts-deepmerge'
import type { BullmqQueueFactory } from '../factories/BullmqQueueFactory.ts'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy.ts'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types.ts'
import { prepareJobOptions } from '../utils.ts'
import { QueueRegistry } from './QueueRegistry.ts'
import type {
  JobPayloadForQueue,
  JobPayloadInputForQueue,
  JobsPaginatedResponse,
  ProtectedQueue,
  QueueConfiguration,
  QueueManagerConfig,
  SupportedJobPayloads,
  SupportedQueueIds,
} from './types.ts'

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

  protected readonly queueRegistry: QueueRegistry<
    Queues,
    QueueType,
    QueueOptionsType,
    JobOptionsType
  >

  private readonly spies: Record<
    QueueConfiguration<QueueOptionsType>['queueId'],
    BackgroundJobProcessorSpy<
      JobPayloadForQueue<Queues, QueueConfiguration<QueueOptionsType>['queueId']>,
      // biome-ignore lint/suspicious/noExplicitAny: At this point we don't know the return type of the spy
      any
    >
  > = {}

  private startPromise?: Promise<void>

  constructor(
    queueFactory: BullmqQueueFactory<QueueType, QueueOptionsType>,
    queues: Queues,
    config: QueueManagerConfig,
  ) {
    this.queueRegistry = new QueueRegistry(queues, queueFactory, config.redisConfig)
    this.config = config

    if (config.isTest) {
      for (const queue of queues) {
        this.spies[queue.queueId] = new BackgroundJobProcessorSpy()
      }
    }
  }

  /**
   * Start the queues
   * @param enabled default true - if true, start all queues, if false, do nothing, if array, start only the queues in the array (array of queue names expected)
   */
  public async start(enabled: string[] | boolean = true): Promise<void> {
    if (this.queueRegistry.isStarted) return // if it is already started -> skip
    if (enabled === false) return // if it is disabled -> skip

    if (!this.startPromise) this.startPromise = this.queueRegistry.start(enabled)

    await this.startPromise
    this.startPromise = undefined
  }

  public dispose(): Promise<void> {
    return this.queueRegistry.dispose()
  }

  public getQueueConfig<QueueId extends SupportedQueueIds<Queues>>(
    queueId: QueueId,
  ): Queues[number] {
    return this.queueRegistry.getQueueConfig(queueId)
  }

  public getQueue<QueueId extends SupportedQueueIds<Queues>, JobReturn = unknown>(
    queueId: QueueId,
  ): ProtectedQueue<JobPayloadForQueue<Queues, QueueId>, JobReturn, QueueType> {
    return this.queueRegistry.getQueue(queueId)
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
    const queueConfig = this.queueRegistry.getQueueConfig(queueId)

    const defaultOptions =
      typeof queueConfig.jobOptions === 'function'
        ? queueConfig.jobOptions(jobPayload)
        : queueConfig.jobOptions

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

  private startIfNotStarted(
    queueId: QueueConfiguration<QueueOptionsType>['queueId'],
  ): Promise<void> {
    if (!this.queueRegistry.isStarted && this.config.lazyInitEnabled === false) {
      throw new Error('QueueManager not started, please call `start` or enable lazy init')
    }

    return this.start([queueId])
  }
}
