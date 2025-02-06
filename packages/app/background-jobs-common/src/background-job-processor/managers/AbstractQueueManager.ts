import type { BaseJobPayload } from '../types.js'
import type { JobsOptions, QueueOptions } from 'bullmq'
import {Queue} from 'bullmq'
import type {
    ProtectedQueue
} from '../processors/types.js'
import { prepareJobOptions, sanitizeRedisConfig } from '../utils.js'
import type { RedisConfig } from '@lokalise/node-core'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy.js'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types.js'

export type QueueConfiguration = {
    queueId: string
    queueOptions?: QueueOptions
    redisConfig: RedisConfig
}

export type QueueManagerConfig = {
    isTest: boolean
    lazyInitEnabled?: boolean
}

export abstract class AbstractQueueManager<Queues extends QueueConfiguration[]>
{
    private queueMap: Record<string, QueueConfiguration> = {}
    private readonly queueIds: Set<string>
    private config: QueueManagerConfig

    private _queues: Record<QueueConfiguration['queueId'], Queue> = {}

    private readonly _spy?: BackgroundJobProcessorSpy<BaseJobPayload, undefined>

    private isStarted = false
    private startPromise?: Promise<void>

    protected constructor(
        queues: Queues,
        config: QueueManagerConfig,
    ) {
        this.queueIds = new Set<string>()

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
            await Promise.allSettled(
                Object.values(this._queues).map((queue) => queue.close()),
            )
        } catch {
            //do nothing
        }

        this.isStarted = false
    }

    public getQueue<JobPayload extends BaseJobPayload, JobReturn = void, QueueType extends Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string> = Queue<
        JobPayload,
        JobReturn,
        string,
        JobPayload,
        JobReturn,
        string
    >>(queueId: string): ProtectedQueue<JobPayload, JobReturn, QueueType> {
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
                ...(queue.queueOptions ?? {}) as Omit<QueueOptions, 'connection' | 'prefix'>,
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

    // @todo: Use payload type from queue configuration based on queueId (resolve by map)
    public async schedule<JobPayload extends BaseJobPayload>(queueId: QueueConfiguration['queueId'], jobData: JobPayload, options?: JobsOptions): Promise<string> {
        await this.startIfNotStarted(queueId)

        const job = await this.getQueue(queueId).add(
            queueId,
            jobData,
            prepareJobOptions(this.config.isTest, options),
        )
        if (!job?.id) throw new Error('Scheduled job ID is undefined')
        if (this._spy) this._spy.addJob(job, 'scheduled')

        return job.id
    }

    public async scheduleBulk<JobPayload extends BaseJobPayload>(
        queueId: QueueConfiguration['queueId'],
        jobData: JobPayload[],
        options?: Omit<JobsOptions, 'repeat'>,
    ): Promise<string[]> {
        if (jobData.length === 0) return []

        await this.startIfNotStarted(queueId)

        const jobs =
            (await this.getQueue(queueId)?.addBulk(
                jobData.map((data) => ({
                    name: queueId,
                    data: data,
                    opts: prepareJobOptions(this.config.isTest, options),
                })),
            )) ?? []

        const jobIds = jobs.map((job) => job.id)
        /* v8 ignore next 4 */
        if (jobIds.length === 0 || !jobIds.every((id) => !!id)) {
            // Practically unreachable, but we want to simplify the signature of the method and avoid
            // stating that it could return undefined.
            throw new Error('Some scheduled job IDs are undefined')
        }
        if (this._spy) this._spy.addJobs(jobs, 'scheduled')

        return jobIds as string[]
    }

    public get spy(): BackgroundJobProcessorSpyInterface<object, unknown> {
        if (!this._spy)
            throw new Error(
                'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
            )

        return this._spy
    }
}