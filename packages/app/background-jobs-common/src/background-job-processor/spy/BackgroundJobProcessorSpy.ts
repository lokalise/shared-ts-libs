import { deepClone, removeNullish } from '@lokalise/node-core'
import type { Job } from 'bullmq'

import type { SafeJob } from '../types'

import type {
	BackgroundJobProcessorSpyInterface,
	JobSpyResult,
	JobDataSelector,
	JobSpyState,
} from './types'

type JobProcessingResult<JobData extends object, jobReturn> = {
	job: JobSpyResult<JobData, jobReturn>
	state?: JobSpyState
}
type PromiseResolve<JobData extends object> = (value: JobData | PromiseLike<JobData>) => void
type JobSelector<JobData extends object, JobReturn> = (job: SafeJob<JobData, JobReturn>) => boolean
type SpyPromise<JobData extends object, JobReturn> = {
	selector: JobSelector<JobData, JobReturn>
	awaitedState: JobSpyState
	resolve: PromiseResolve<SafeJob<JobData, JobReturn>>
	promise: Promise<Job<JobData, JobReturn>>
}

export class BackgroundJobProcessorSpy<JobData extends object, JobReturn>
	implements BackgroundJobProcessorSpyInterface<JobData, JobReturn>
{
	private readonly jobResults: Map<string, JobProcessingResult<JobData, JobReturn>>
	private promises: SpyPromise<JobData, JobReturn>[]

	constructor() {
		this.jobResults = new Map()
		this.promises = []
	}

	clear(): void {
		this.jobResults.clear()
		this.promises = []
	}

	waitForJobWithId(
		id: string | undefined,
		awaitedState: JobSpyState,
	): Promise<JobSpyResult<JobData, JobReturn>> {
		if (!id) {
			throw new Error('Job id is not defined or empty')
		}

		const result = this.jobResults.get(id)
		if (result && result.state === awaitedState) {
			return Promise.resolve(result.job)
		}

		return this.registerPromise((job) => job.id === id, awaitedState)
	}

	waitForJob(
		jobSelector: JobDataSelector<JobData>,
		awaitedState: JobSpyState,
	): Promise<JobSpyResult<JobData, JobReturn>> {
		const result = Array.from(this.jobResults.values()).find(
			(spy) => jobSelector(spy.job.data) && spy.state === awaitedState,
		)
		if (result) {
			return Promise.resolve(result.job)
		}

		return this.registerPromise((job) => jobSelector(job.data), awaitedState)
	}

	private async registerPromise(
		selector: JobSelector<JobData, JobReturn>,
		state: JobSpyState,
	): Promise<Job<JobData, JobReturn>> {
		let resolve: PromiseResolve<Job<JobData>>
		const promise = new Promise<Job<JobData, JobReturn>>((_resolve) => {
			resolve = _resolve
		})
		// @ts-ignore
		this.promises.push({ selector, awaitedState: state, resolve, promise })

		return promise
	}

	/**
	 * Adds a job processing result and resolves any promises waiting for a matching job in the given final state.
	 * Note: This method is not exposed on {@link BackgroundJobProcessorSpyInterface}, it is intended to be
	 * a private package method
	 *
	 * JobData is cloned, to be protected against purge after the job is completed.
	 *
	 * @param job - The job to be added or updated.
	 * @param  state - Final state of the job.
	 * @returns void
	 */
	addJobProcessingResult(job: SafeJob<JobData>, state: JobSpyState): void {
		// TODO: we might need to change this to accommodate new job state so even when job is done we can have another entry with the scheduled one
		if (!job.id) return
		const clonedJob = { ...job, data: deepClone(job.data) }
		this.jobResults.set(job.id, { job: clonedJob, state })

		if (this.promises.length === 0) return

		const indexes = this.promises.map((promise, index) => {
			if (promise.selector(clonedJob) && state === promise.awaitedState) {
				promise.resolve(clonedJob)
				return index
			}
		})
		for (const index of removeNullish(indexes)) {
			this.promises.splice(index, 1)
		}
	}
}
