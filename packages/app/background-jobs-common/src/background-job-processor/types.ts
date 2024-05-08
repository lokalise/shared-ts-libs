import type {
	CommonLogger,
	ErrorReporter,
	TransactionObservabilityManager,
} from '@lokalise/node-core'
import type {
	Job,
	FinishedStatus,
	Queue,
	QueueOptions,
	Worker,
	WorkerOptions,
	JobsOptions,
} from 'bullmq'
import type Redis from 'ioredis'

import type { RequestContext } from './processors/AbstractBackgroundJobProcessor'
import type { AbstractBullmqFactory } from './processors/factories/AbstractBullmqFactory'

export type JobFinalState = FinishedStatus

export type BackgroundJobProcessorConfig<
	QueueOptionsType extends QueueOptions = QueueOptions,
	WorkerOptionsType extends WorkerOptions = WorkerOptions,
> = {
	queueId: string
	isTest: boolean

	// Name of a webservice or a module running the bg job. Used for logging/observability
	ownerName: string
	queueOptions?: Partial<QueueOptionsType>
	workerOptions: Partial<WorkerOptionsType>
}

export { TransactionObservabilityManager }

// "scripts" field is incompatible between free and pro versions, and it's not particularly important
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeJob<T = any, R = any, N extends string = string> = Omit<Job<T, R, N>, 'scripts'> & {
	requestContext?: RequestContext
}

export type SafeQueue<
	JobsOptionsType = JobsOptions,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	DataType = any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ResultType = any,
	NameType extends string = string,
> = Omit<Queue<DataType, ResultType, NameType>, 'add' | 'addBulk' | 'getJobs'> & {
	add(
		name: NameType,
		data: DataType,
		opts?: JobsOptionsType,
	): Promise<SafeJob<DataType, ResultType, NameType>>
	addBulk(
		jobs: {
			name: NameType
			data: DataType
			opts?: JobsOptionsType
		}[],
	): Promise<SafeJob<DataType, ResultType, NameType>[]>
	getJobs(
		types?: JobType[] | JobType,
		start?: number,
		end?: number,
		asc?: boolean,
	): Promise<SafeJob<DataType, ResultType, NameType>[]>
}

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
	JobsOptionsType extends JobsOptions = JobsOptions,
	QueueType extends SafeQueue<JobsOptionsType, JobPayload, JobReturn> = Queue<
		JobPayload,
		JobReturn
	>,
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
	logger: CommonLogger
	errorReporter: ErrorReporter
	bullmqFactory: AbstractBullmqFactory<
		QueueType,
		QueueOptionsType,
		WorkerType,
		WorkerOptionsType,
		ProcessorType,
		JobType,
		JobPayload,
		JobReturn,
		JobsOptionsType
	>
}

export type BaseJobPayload = {
	metadata: {
		correlationId: string
	}
}
