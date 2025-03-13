import { type Job, Queue, Worker } from 'bullmq'
import type { Processor, QueueOptions, WorkerOptions } from 'bullmq'
import type { BullmqProcessor } from '../types.js'
import type { BullmqQueueFactory } from './BullmqQueueFactory.js'
import type { BullmqWorkerFactory } from './BullmqWorkerFactory.js'

export class CommonBullmqFactoryNew
  implements
    BullmqQueueFactory<Queue, QueueOptions>,
    BullmqWorkerFactory<Worker, WorkerOptions, Job, BullmqProcessor<Job>>
{
  buildQueue(queueId: string, options: QueueOptions): Queue {
    return new Queue(queueId, options)
  }

  buildWorker(
    queueId: string,
    processor?: string | URL | null | Processor,
    options?: WorkerOptions,
  ): Worker {
    return new Worker(queueId, processor, options)
  }
}
