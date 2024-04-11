import type { Processor, QueueOptions, WorkerOptions, Job } from 'bullmq'
import { Queue, Worker } from 'bullmq'

import type { BullmqProcessor } from '../../types'

import type { AbstractBullmqFactory } from './AbstractBullmqFactory'

export class CommonBullmqFactory<JobPayload extends object, JobReturn = void>
	implements
		AbstractBullmqFactory<
			Queue<JobPayload, JobReturn>,
			QueueOptions,
			Worker<JobPayload, JobReturn>,
			WorkerOptions,
			BullmqProcessor<Job, JobPayload, JobReturn>,
			Job<JobPayload, JobReturn>,
			JobPayload,
			JobReturn
		>
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
