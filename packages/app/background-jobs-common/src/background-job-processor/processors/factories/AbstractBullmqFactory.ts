import type { Job, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'

import type { BullmqProcessor } from '../../types'

export abstract class AbstractBullmqFactory<
	QueueType extends Queue<JobPayload, JobReturn>,
	QueueOptionsType extends QueueOptions,
	WorkerType extends Worker<JobPayload, JobReturn>,
	WorkerOptionsType extends WorkerOptions,
	ProcessorType extends BullmqProcessor<JobType, JobPayload, JobReturn>,
	JobType extends Job,
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
