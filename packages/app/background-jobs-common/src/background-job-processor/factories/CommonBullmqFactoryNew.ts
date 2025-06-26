import type { Processor, QueueOptions, WorkerOptions } from 'bullmq'
import { type Job, Queue, Worker } from 'bullmq'
import type { BullmqProcessor } from '../types.ts'
import type { BullmqQueueFactory } from './BullmqQueueFactory.ts'
import type { BullmqWorkerFactory } from './BullmqWorkerFactory.ts'

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
