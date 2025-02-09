import { Worker } from 'bullmq'
import type { Job, Processor, WorkerOptions } from 'bullmq'

import type { BullmqProcessor } from '../types'
import type { BullmqWorkerFactory } from './BullmqWorkerFactory'

export class CommonBullmqWorkerFactory
  implements BullmqWorkerFactory<Worker, WorkerOptions, Job, BullmqProcessor<Job>>
{
  buildWorker(
    queueId: string,
    processor?: string | URL | null | Processor,
    options?: WorkerOptions,
  ): Worker {
    return new Worker(queueId, processor, options)
  }
}
