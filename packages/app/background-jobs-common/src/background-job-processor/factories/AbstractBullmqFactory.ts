import type { Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'

import type { BullmqProcessor, SafeJob } from '../types.js'

export abstract class AbstractBullmqFactory<
  QueueType extends Queue<JobPayload, JobReturn, string, JobPayload, JobReturn, string>,
  QueueOptionsType extends QueueOptions,
  WorkerType extends Worker<JobPayload, JobReturn>,
  WorkerOptionsType extends WorkerOptions,
  ProcessorType extends BullmqProcessor<JobType, JobPayload, JobReturn>,
  JobType extends SafeJob<JobPayload, JobReturn>,
  JobPayload extends object,
  JobReturn,
> {
  abstract buildQueue(queueId: string, options?: QueueOptionsType): QueueType
  abstract buildWorker(
    queueId: string,
    processor?: ProcessorType,
    options?: WorkerOptionsType,
  ): WorkerType
}
