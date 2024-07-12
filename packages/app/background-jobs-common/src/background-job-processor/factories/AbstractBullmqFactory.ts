import type { QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type { JobsOptions } from 'bullmq/dist/esm/types'

import type { BullmqProcessor, SafeJob, SafeQueue } from '../types'

export abstract class AbstractBullmqFactory<
  QueueType extends SafeQueue<JobsOptionsType, JobPayload, JobReturn>,
  QueueOptionsType extends QueueOptions,
  WorkerType extends Worker<JobPayload, JobReturn>,
  WorkerOptionsType extends WorkerOptions,
  ProcessorType extends BullmqProcessor<JobType, JobPayload, JobReturn>,
  JobType extends SafeJob<JobPayload, JobReturn>,
  JobPayload extends object,
  JobReturn,
  JobsOptionsType extends JobsOptions,
> {
  abstract buildQueue(queueId: string, options?: QueueOptionsType): QueueType
  abstract buildWorker(
    queueId: string,
    processor?: ProcessorType,
    options?: WorkerOptionsType,
  ): WorkerType
}
