import type { JobsOptions, QueueOptions } from 'bullmq'
import { Queue } from 'bullmq'
import type { JobState } from 'bullmq/dist/esm/types/job-type'
import { merge } from 'ts-deepmerge'
import type { JobsPaginatedResponse, ProtectedQueue } from '../processors/types'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
import type { BaseJobPayload } from '../types'
import { prepareJobOptions, sanitizeRedisConfig } from '../utils'
import type { JobRegistry } from './JobRegistry'
import type {
  JobDefinition,
  JobPayloadForQueue,
  QueueConfiguration,
  QueueManagerConfig,
  SupportedQueues,
} from './types'

export class QueueManager<SupportedJobs extends JobDefinition[]> {
  private readonly queueMap: Record<string, QueueConfiguration> = {}
  private readonly queueIds: Set<string>
  private config: QueueManagerConfig
  private readonly jobRegistry: JobRegistry<SupportedJobs>

  private _queues: Record<QueueConfiguration['queueId'], Queue> = {}

  private readonly _spy?: BackgroundJobProcessorSpy<BaseJobPayload, undefined>

  private isStarted = false
  private startPromise?: Promise<void>

  protected constructor(
    queues: QueueConfiguration[],
    jobRegistry: JobRegistry<SupportedJobs>,
    config: QueueManagerConfig,
  ) {
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

  public getQueue<
    JobPayload extends BaseJobPayload,
    JobReturn = void,
    QueueType extends Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string> = Queue<
      JobPayload,
      JobReturn,
      string,
      JobPayload,
      JobReturn,
      string
    >,
  >(queueId: SupportedQueues<SupportedJobs>): ProtectedQueue<JobPayload, JobReturn, QueueType> {
    /* v8 ignore next 3 */
    if (!this._queues[queueId]) {
      throw new Error(`queue ${queueId} was not instantiated yet, please run "start()"`)
    }

    // @ts-ignore
    return this._queues[queueId]
  }

  private buildQueue<JobPayload, JobReturn>(
    queueId: QueueConfiguration['queueId'],
    options?: QueueOptions,
  ): Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string> {
    return new Queue(queueId, options)
  }

  public async start(queueIdsToStart?: string[]): Promise<void> {
    if (this.isStarted) return // if it is already started -> skip

    if (!this.startPromise) this.startPromise = this.internalStart(queueIdsToStart)
    await this.startPromise
    this.startPromise = undefined
  }

  private startIfNotStarted(queueId: QueueConfiguration['queueId']): Promise<void> {
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
        ...((queue.queueOptions ?? {}) as Omit<QueueOptions, 'connection' | 'prefix'>),
        connection: sanitizeRedisConfig(queue.redisConfig),
        prefix: queue.redisConfig?.keyPrefix ?? undefined,
      }
      const queuePromise = this.buildQueue(queueId, queueOptions)
      this._queues[queueId] = queuePromise
      queuePromises.push(queuePromise.waitUntilReady())
    }

    if (queuePromises.length) {
      await Promise.allSettled(queuePromises)
    }

    this.isStarted = true
  }

  public async getJobCount(queueId: QueueConfiguration['queueId']): Promise<number> {
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
    const defaultJobOptions = this.jobRegistry.getJobOptions(queueId) ?? {}

    await this.startIfNotStarted(queueId)

    const job = await this.getQueue(queueId).add(
      queueId,
      // @ts-ignore
      jobPayload,
      prepareJobOptions(this.config.isTest, merge(defaultJobOptions, options ?? {})),
    )
    if (!job?.id) throw new Error('Scheduled job ID is undefined')
    if (this._spy) this._spy.addJob(job, 'scheduled')

    return job.id
  }

  public async scheduleBulk<QueueId extends SupportedQueues<SupportedJobs>>(
    queueId: QueueId,
    jobPayloads: JobPayloadForQueue<QueueId, SupportedJobs>[],
    options?: Omit<JobsOptions, 'repeat'>,
  ): Promise<string[]> {
    const defaultJobOptions = this.jobRegistry.getJobOptions(queueId) ?? {}

    if (jobPayloads.length === 0) return []

    await this.startIfNotStarted(queueId)

    const jobs =
      (await this.getQueue(queueId)?.addBulk(
        // @ts-expect-error
        jobPayloads.map((data) => ({
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
  public async getJobsInQueue<JobPayload extends BaseJobPayload, JobReturn = void>(
    queueId: SupportedQueues<SupportedJobs>,
    states: JobState[],
    start = 0,
    end = 20,
    asc = true,
  ): Promise<JobsPaginatedResponse<JobPayload, JobReturn>> {
    if (states.length === 0) throw new Error('states must not be empty')
    if (start > end) throw new Error('start must be less than or equal to end')

    await this.startIfNotStarted(queueId)

    const jobs =
      (await this.getQueue<JobPayload, JobReturn>(queueId)?.getJobs(states, start, end + 1, asc)) ??
      []
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
