import type { Processor, QueueBaseOptions, QueueOptions, WorkerOptions } from 'bullmq'
import { FlowProducer, type Job, Queue, Worker } from 'bullmq'
import type { BullmqProcessor } from '../types.ts'
import type { BullmqFlowProducerFactory } from './BullmqFlowProducerFactory.ts'
import type { BullmqQueueFactory } from './BullmqQueueFactory.ts'
import type { BullmqWorkerFactory } from './BullmqWorkerFactory.ts'

export class CommonBullmqFactoryNew
  implements
    BullmqQueueFactory<Queue, QueueOptions>,
    BullmqWorkerFactory<Worker, WorkerOptions, Job, BullmqProcessor<Job>>,
    BullmqFlowProducerFactory<FlowProducer, QueueBaseOptions>
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

  buildFlowProducer(options: QueueBaseOptions): FlowProducer {
    return new FlowProducer(options)
  }
}
