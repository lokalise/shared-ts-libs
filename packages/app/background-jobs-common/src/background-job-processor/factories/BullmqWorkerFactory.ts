import type { Worker, WorkerOptions } from 'bullmq'
import type { BullmqProcessor, SafeJob } from '../types.ts'

export interface BullmqWorkerFactory<
  WorkerType extends Worker,
  WorkerOptionsType extends WorkerOptions,
  JobType extends SafeJob,
  ProcessorType extends BullmqProcessor<JobType>,
> {
  buildWorker(queueId: string, processor?: ProcessorType, options?: WorkerOptionsType): WorkerType
}
