import type { JobsOptions, QueueOptions } from 'bullmq'
import type { QueueConfiguration, SupportedQueueIds } from './types'

export class QueueRegistry<
  Queues extends QueueConfiguration<QueueOptionsType, JobOptionsType>[],
  QueueOptionsType extends QueueOptions,
  JobOptionsType extends JobsOptions,
> {
  private readonly supportedQueuesMap: Record<string, Queues[number]> = {}
  public readonly queueIds: Set<string>

  constructor(supportedQueues: Queues) {
    this.queueIds = new Set<string>()

    for (const queue of supportedQueues) {
      this.supportedQueuesMap[queue.queueId] = queue
      this.queueIds.add(queue.queueId)
    }
  }

  public getQueueConfig(queueId: SupportedQueueIds<Queues>): Queues[number] {
    if (!this.isSupportedQueue(queueId)) {
      throw new Error(`Queue with id ${queueId} is not supported`)
    }

    return this.supportedQueuesMap[queueId]
  }

  private isSupportedQueue(queueId: string): boolean {
    return this.queueIds.has(queueId)
  }
}
