import { randomUUID } from 'node:crypto'

import { deepClone, removeNullish } from '@lokalise/node-core'
import type { Job } from 'bullmq'

import type { JobFinalState, SafeJob } from '../types'

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
	private readonly scheduledJobs: Map<string, SafeJob<JobData>>

	private readonly jobProcessingResults: Map<string, JobProcessingResult<JobData, JobReturn>>
	private finishedJobsPromises: SpyPromise<JobData, JobReturn>[]
	private scheduledJobsPromises: SpyPromise<JobData, JobData>[]

	constructor() {
		this.jobProcessingResults = new Map()
		this.scheduledJobs = new Map()
		this.finishedJobsPromises = []
		this.scheduledJobsPromises = []
	}

	clear(): void {
		this.jobProcessingResults.clear()
		this.scheduledJobs.clear()
		this.finishedJobsPromises = []
	}

	waitForFinishedJobWithId(
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

		return this.registerFinishedJobPromise((job) => job.id === id, awaitedState)
	}

	waitForFinishedJob(
		jobSelector: JobDataSelector<JobData>,
		awaitedState: JobFinalState,
	): Promise<JobSpyResult<JobData, JobReturn>> {
		const result = Array.from(this.jobProcessingResults.values()).find(
			(spy) => jobSelector(spy.job.data) && spy.state === awaitedState,
		)
		if (result) {
			return Promise.resolve(result.job)
		}

		return this.registerFinishedJobPromise((job) => jobSelector(job.data), awaitedState)
	}

	waitForScheduledJob(
		jobSelector: JobDataSelector<JobData>,
	): Promise<JobSpyResult<JobData, JobReturn>> {
		const result = Array.from(this.scheduledJobs.values()).find((scheduledJob) =>
			jobSelector(scheduledJob.data),
		)
		if (result) {
			return Promise.resolve(result)
		}

		return this.registerScheduledJobPromise((job) => jobSelector(job.data))
	}

	private async registerFinishedJobPromise(
		selector: JobSelector<JobData, JobReturn>,
		state: JobFinalState,
	): Promise<Job<JobData, JobReturn>> {
		let resolve: PromiseResolve<Job<JobData>>
		const promise = new Promise<Job<JobData, JobReturn>>((_resolve) => {
			resolve = _resolve
		})
		// @ts-ignore
		this.finishedJobsPromises.push({ selector, awaitedState: state, resolve, promise })

		return promise
	}

	private async registerScheduledJobPromise(
		selector: JobSelector<JobData, JobReturn>,
	): Promise<Job<JobData, JobReturn>> {
		let resolve: PromiseResolve<Job<JobData>>
		const promise = new Promise<Job<JobData, JobReturn>>((_resolve) => {
			resolve = _resolve
		})
		// @ts-ignore
		this.scheduledJobsPromises.push({ selector, resolve, promise })

		return promise
	}

	/**
	 * Adds a scheduled job payload and resolves any promises waiting for a matching job with the given payload
	 * Note: This method is not exposed on {@link BackgroundJobProcessorSpyInterface}, it is intended to be
	 * a private package method
	 *
	 * JobData is cloned, to be protected against purge after the job is completed.
	 *
	 * @param job - The job that was scheduled
	 * @returns void
	 */
	addJobScheduled(job: SafeJob<JobData>): void {
		const clonedJob = { ...job, data: deepClone(job.data) }
		this.scheduledJobs.set(job.id ?? randomUUID(), clonedJob)

		if (this.scheduledJobsPromises.length === 0) {
			return
		}

		const indexes = this.scheduledJobsPromises.map((promise, index) => {
			if (promise.selector(clonedJob)) {
				promise.resolve(clonedJob)
				return index
			}
		})
		for (const index of removeNullish(indexes)) {
			this.scheduledJobsPromises.splice(index, 1)
		}
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
		if (!job.id) {
			return
		}
		const clonedJob = { ...job, data: deepClone(job.data) }
		this.jobProcessingResults.set(job.id, { job: clonedJob, state })

		if (this.finishedJobsPromises.length === 0) return

		const indexes = this.finishedJobsPromises.map((promise, index) => {
			if (promise.selector(clonedJob) && state === promise.awaitedState) {
				promise.resolve(clonedJob)
				return index
			}
		})
		for (const index of removeNullish(indexes)) {
			this.finishedJobsPromises.splice(index, 1)
		}
	}
}
