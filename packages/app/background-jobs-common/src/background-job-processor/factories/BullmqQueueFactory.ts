import type { Queue, QueueOptions } from 'bullmq'

export interface BullmqQueueFactory<
  QueueType extends Queue,
  QueueOptionsType extends QueueOptions,
> {
  buildQueue(queueId: string, options?: QueueOptionsType): QueueType
}
