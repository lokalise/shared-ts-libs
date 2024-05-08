import type { Job, FinishedStatus, Queue, JobsOptions, JobState } from 'bullmq'

import type { RequestContext } from './processors/AbstractBackgroundJobProcessor'

export type JobFinalState = FinishedStatus
export type BaseJobPayload = { metadata: { correlationId: string } }

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
		types?: JobState[] | JobState,
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
