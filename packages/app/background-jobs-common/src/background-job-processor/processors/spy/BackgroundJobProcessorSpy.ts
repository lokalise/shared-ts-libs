import { removeNullish } from '@lokalise/node-core'
import type { Job } from 'bullmq'

import type { JobFinalState } from '../../types'

import type { BackgroundJobProcessorSpyInterface, JobSpyResult, JobDataSelector } from './types'

type JobProcessingResult<T extends object> = {
	job: JobSpyResult<T>
	state?: JobFinalState
}
type PromiseResolve<T extends object> = (value: T | PromiseLike<T>) => void
type JobSelector<T extends object> = (job: Job<T>) => boolean
type SpyPromise<T extends object> = {
	selector: JobSelector<T>
	awaitedState: JobFinalState
	resolve: PromiseResolve<Job<T>>
	promise: Promise<Job<T>>
}

export class BackgroundJobProcessorSpy<JobData extends object>
	implements BackgroundJobProcessorSpyInterface<JobData>
{
	private readonly jobProcessingResults: Map<string, JobProcessingResult<JobData>>
	private promises: SpyPromise<JobData>[]

	constructor() {
		this.jobProcessingResults = new Map()
		this.promises = []
	}

	clear(): void {
		this.jobProcessingResults.clear()
		this.promises = []
	}

	waitForJobWithId(
		id: string | undefined,
		awaitedState: JobFinalState,
	): Promise<JobSpyResult<JobData>> {
		if (!id) {
			throw new Error('Job id is not defined or empty')
		}

		const result = this.jobProcessingResults.get(id)
		if (result && result.state === awaitedState) {
			return Promise.resolve(result.job)
		}

		return this.registerPromise((job) => job.id === id, awaitedState)
	}

	waitForJob(
		jobSelector: JobDataSelector<JobData>,
		awaitedState: JobFinalState,
	): Promise<JobSpyResult<JobData>> {
		const result = Array.from(this.jobProcessingResults.values()).find(
			(spy) => jobSelector(spy.job.data) && spy.state === awaitedState,
		)
		if (result) {
			return Promise.resolve(result.job)
		}

		return this.registerPromise((job) => jobSelector(job.data), awaitedState)
	}

	private async registerPromise(
		selector: JobSelector<JobData>,
		state: JobFinalState,
	): Promise<Job<JobData>> {
		let resolve: PromiseResolve<Job<JobData>>
		const promise = new Promise<Job<JobData>>((_resolve) => {
			resolve = _resolve
		})
		// @ts-ignore
		this.promises.push({ selector, awaitedState: state, resolve, promise })

		return promise
	}

	/**
	 * Adds a job processing result and resolves any promises waiting for a matching job in the given final state.
	 * Note: This method is not exposed on BackgroundJobProcessorSpyInterface, it is intended to be
	 * a private package method
	 *
	 * @param job - The job to be added or updated.
	 * @param  state - Final state of the job.
	 * @returns void
	 */
	addJobProcessingResult(job: Job<JobData>, state: JobFinalState): void {
		if (!job.id) return
		this.jobProcessingResults.set(job.id, { job, state })

		if (this.promises.length === 0) return

		const indexes = this.promises.map((promise, index) => {
			if (promise.selector(job) && state === promise.awaitedState) {
				promise.resolve(job)
				return index
			}
		})
		for (const index of removeNullish(indexes)) {
			this.promises.splice(index, 1)
		}
	}
}
