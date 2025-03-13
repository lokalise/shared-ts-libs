import { Queue, Worker } from 'bullmq'
import type { Job, Processor, QueueOptions, WorkerOptions } from 'bullmq'

import type { BullmqProcessor } from '../types.js'

import type { AbstractBullmqFactory } from './AbstractBullmqFactory.js'

export class CommonBullmqFactory<JobPayload extends object, JobReturn = void>
  implements
    AbstractBullmqFactory<
      Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string>,
      QueueOptions,
      Worker<JobPayload, JobReturn>,
      WorkerOptions,
      BullmqProcessor<Job, JobPayload, JobReturn>,
      Job<JobPayload, JobReturn>,
      JobPayload,
      JobReturn
    >
{
  buildQueue(
    queueId: string,
    options: QueueOptions,
  ): Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string> {
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
