import type { ErrorReporter } from '@lokalise/node-core'
import type { Job, FinishedStatus, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq'
import type Redis from 'ioredis'
import type { Logger } from 'pino'

import type { AbstractBullmqFactory } from './processors/factories/AbstractBullmqFactory'

export type JobFinalState = FinishedStatus

export type BackgroundJobProcessorConfig<
	QueueOptionsType extends QueueOptions,
	WorkerOptionsType extends WorkerOptions,
> = {
	queueId: string
	isTest: boolean
	queueOptions?: Partial<QueueOptionsType>
	workerOptions: Partial<WorkerOptionsType>
}

export type TransactionObservabilityManager = {
	start: (transactionSpanId: string) => unknown
	stop: (transactionSpanId: string) => unknown
}

// "scripts" field is incompatible between free and pro versions, and it's not particularly important
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeJob<T = any, R = any, N extends string = string> = Omit<Job<T, R, N>, 'scripts'>

export type BullmqProcessor<
	J extends SafeJob<T, R, N>,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	T = any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	R = any,
	N extends string = string,
> = (job: J, token?: string) => Promise<R>

export type BackgroundJobProcessorDependencies<
	JobPayload extends object,
	JobReturn = void,
	JobType extends SafeJob<JobPayload, JobReturn> = Job,
	QueueType extends Queue<JobPayload, JobReturn> = Queue<JobPayload, JobReturn>,
	QueueOptionsType extends QueueOptions = QueueOptions,
	WorkerType extends Worker<JobPayload, JobReturn> = Worker<JobPayload, JobReturn>,
	WorkerOptionsType extends WorkerOptions = WorkerOptions,
	ProcessorType extends BullmqProcessor<JobType, JobPayload, JobReturn> = BullmqProcessor<
		JobType,
		JobPayload,
		JobReturn
	>,
> = {
	redis: Redis
	transactionObservabilityManager: TransactionObservabilityManager
	logger: Logger
	errorReporter: ErrorReporter
	bullmqFactory: AbstractBullmqFactory<
		QueueType,
		QueueOptionsType,
		WorkerType,
		WorkerOptionsType,
		ProcessorType,
		JobType,
		JobPayload,
		JobReturn
	>
}
