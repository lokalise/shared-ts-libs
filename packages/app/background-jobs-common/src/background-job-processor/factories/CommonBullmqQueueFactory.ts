import { Queue } from 'bullmq'
import type { QueueOptions } from 'bullmq'
import type { BullmqQueueFactory } from './BullmqQueueFactory'

export class CommonBullmqQueueFactory implements BullmqQueueFactory<Queue, QueueOptions> {
  buildQueue(queueId: string, options: QueueOptions): Queue {
    return new Queue(queueId, options)
  }
}
