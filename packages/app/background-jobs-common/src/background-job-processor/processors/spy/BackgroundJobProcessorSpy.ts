import { deepClone, removeNullish } from '@lokalise/node-core'
import type { Job } from 'bullmq'

import type { JobFinalState, SafeJob } from '../../types'

import type { BackgroundJobProcessorSpyInterface, JobSpyResult, JobDataSelector } from './types'

type JobProcessingResult<JobData extends object, jobReturn> = {
	job: JobSpyResult<JobData, jobReturn>
	state?: JobFinalState
}
type PromiseResolve<JobData extends object> = (value: JobData | PromiseLike<JobData>) => void
type JobSelector<JobData extends object, JobReturn> = (job: SafeJob<JobData, JobReturn>) => boolean
type SpyPromise<JobData extends object, JobReturn> = {
	selector: JobSelector<JobData, JobReturn>
	awaitedState: JobFinalState
	resolve: PromiseResolve<SafeJob<JobData, JobReturn>>
	promise: Promise<Job<JobData, JobReturn>>
}

export class BackgroundJobProcessorSpy<JobData extends object, JobReturn>
	implements BackgroundJobProcessorSpyInterface<JobData, JobReturn>
{
	private readonly jobProcessingResults: Map<string, JobProcessingResult<JobData, JobReturn>>
	private promises: SpyPromise<JobData, JobReturn>[]

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
	): Promise<JobSpyResult<JobData, JobReturn>> {
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
	): Promise<JobSpyResult<JobData, JobReturn>> {
		const result = Array.from(this.jobProcessingResults.values()).find(
			(spy) => jobSelector(spy.job.data) && spy.state === awaitedState,
		)
		if (result) {
			return Promise.resolve(result.job)
		}

		return this.registerPromise((job) => jobSelector(job.data), awaitedState)
	}

	private async registerPromise(
		selector: JobSelector<JobData, JobReturn>,
		state: JobFinalState,
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
	addJobProcessingResult(job: SafeJob<JobData>, state: JobFinalState): void {
		if (!job.id) return
		const clonedJobData = deepClone(job.data)
		this.jobProcessingResults.set(job.id, { job: { ...job, data: clonedJobData }, state })

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
