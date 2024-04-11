import type { Job } from 'bullmq'

import type { BackgroundJobProcessorDependencies } from '../types'

import { AbstractBackgroundJobProcessor } from './AbstractBackgroundJobProcessor'

export class FakeBackgroundJobProcessor<
	T extends object,
> extends AbstractBackgroundJobProcessor<T> {
	private _processCalls: T[] = []

	constructor(
		dependencies: BackgroundJobProcessorDependencies<T>,
		queueName: string,
		isTest = true,
	) {
		super(dependencies, {
			queueId: queueName,
			isTest,
			workerOptions: {
				concurrency: 1,
			},
		})
	}
	protected override process(job: Job<T>): Promise<void> {
		this._processCalls.push(job.data)
		return Promise.resolve(undefined)
	}

	protected onFailed(_job: Job<T>, _error: Error): Promise<void> {
		return Promise.resolve(undefined)
	}

	/**
	 * @deprecated use job spy instead
	 */
	public get processCalls(): T[] {
		return this._processCalls
	}

	/**
	 * @deprecated use job spy instead
	 */
	public clean(): void {
		this._processCalls = []
	}
}
