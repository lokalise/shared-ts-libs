import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions, Queue, QueueOptions } from 'bullmq'
import { merge } from 'ts-deepmerge'
import { DEFAULT_QUEUE_OPTIONS } from '../constants.ts'
import type { BullmqQueueFactory } from '../factories/index.ts'
import { registerActiveQueueIds } from '../monitoring/registerActiveQueueIds.ts'
import { enrichRedisConfig, sanitizeRedisConfig } from '../public-utils/index.ts'
import { resolveQueueId } from '../utils.ts'
import type { QueueConfiguration, SupportedQueueIds } from './types.ts'

/**
 * Read-only registry of queue configurations indexed by queueId.
 *
 * Holds no Bull queue instances and has no lifecycle — use this when you only
 * need typed access to {@link QueueConfiguration} entries (for example, from a
 * FlowManager that publishes through a shared FlowProducer).
 */
export class QueueConfigRegistry<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> {
  public readonly queueIds: Set<string>

  protected readonly queuesConfig: Record<string, Queues[number]> = {}

  constructor(supportedQueues: Queues) {
    this.queueIds = new Set<string>()
    for (const queue of supportedQueues) {
      this.queuesConfig[queue.queueId] = queue
      this.queueIds.add(queue.queueId)
    }
  }

  public getQueueConfig(queueId: SupportedQueueIds<Queues>): Queues[number] {
    if (!this.isSupportedQueue(queueId) || !this.queuesConfig[queueId]) {
      throw new Error(`Queue with id ${queueId} is not supported`)
    }

    return this.queuesConfig[queueId]
  }

  protected isSupportedQueue(queueId: string): boolean {
    return this.queueIds.has(queueId)
  }
}

export class QueueRegistry<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  QueueType extends Queue,
  QueueOptionsType extends QueueOptions,
  JobOptionsType extends JobsOptions,
> extends QueueConfigRegistry<Queues, QueueOptionsType, JobOptionsType> {
  private readonly factory: BullmqQueueFactory<QueueType, QueueOptionsType>
  private readonly redisConfig: RedisConfig

  private queues: Record<QueueConfiguration<QueueOptionsType>['queueId'], QueueType> = {}

  constructor(
    supportedQueues: Queues,
    factory: BullmqQueueFactory<QueueType, QueueOptionsType>,
    redisConfig: RedisConfig,
  ) {
    super(supportedQueues)
    this.factory = factory
    this.redisConfig = redisConfig
  }

  public async start(enabled: string[] | true): Promise<void> {
    const queuePromises = []
    const queueConfigs = []
    const queueIdSetToStart = enabled === true ? this.queueIds : new Set(enabled)

    for (const queueId of queueIdSetToStart) {
      if (!this.queueIds.has(queueId)) continue

      const queueConfig = this.getQueueConfig(queueId)
      const queue = this.factory.buildQueue(resolveQueueId(queueConfig), {
        ...(merge(DEFAULT_QUEUE_OPTIONS, queueConfig.queueOptions ?? {}) as QueueOptionsType),
        connection: sanitizeRedisConfig(enrichRedisConfig(this.redisConfig)),
        prefix: this.redisConfig.keyPrefix ?? undefined,
      })
      this.queues[queueId] = queue
      queuePromises.push(queue.waitUntilReady())
      queueConfigs.push(queueConfig)
    }

    if (queuePromises.length) await Promise.all(queuePromises)

    await registerActiveQueueIds(this.redisConfig, queueConfigs)
  }

  public async dispose(): Promise<void> {
    if (!this.isStarted) return

    try {
      await Promise.allSettled(Object.values(this.queues).map((queue) => queue.close()))
      /* v8 ignore start */
    } catch {
      //do nothing
    }
    /* v8 ignore stop */

    this.queues = {}
  }

  public get isStarted(): boolean {
    return Object.keys(this.queues).length > 0
  }

  public getQueue<QueueId extends SupportedQueueIds<Queues>>(queueId: QueueId): QueueType {
    if (!this.queues[queueId]) {
      throw new Error(`queue ${queueId} was not instantiated yet, please run "start()"`)
    }

    return this.queues[queueId]
  }
}
