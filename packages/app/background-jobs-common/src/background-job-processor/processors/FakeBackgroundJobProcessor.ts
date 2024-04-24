import type { Job } from 'bullmq'

import type { BackgroundJobProcessorDependencies, BaseJobPayload } from '../types'

import { AbstractBackgroundJobProcessor } from './AbstractBackgroundJobProcessor'
import { CommonBullmqFactory } from './factories/CommonBullmqFactory'

export class FakeBackgroundJobProcessor<
	JobData extends BaseJobPayload,
> extends AbstractBackgroundJobProcessor<JobData> {
	private _processCalls: JobData[] = []

	constructor(
		dependencies: Omit<
			BackgroundJobProcessorDependencies<JobData>,
			'bullmqFactory' | 'transactionObservabilityManager'
		>,
		queueName: string,
		isTest = true,
	) {
		super(
			{
				redis: dependencies.redis,
				transactionObservabilityManager: { start: () => {}, stop: () => {} },
				logger: dependencies.logger,
				errorReporter: dependencies.errorReporter,
				bullmqFactory: new CommonBullmqFactory(),
			},
			{
				queueId: queueName,
				isTest,
				workerOptions: { concurrency: 1 },
			},
		)
	}
	protected override process(job: Job<JobData>): Promise<void> {
		this._processCalls.push(job.data)
		return Promise.resolve()
	}

	protected onFailed(_job: Job<JobData>, _error: Error): Promise<void> {
		return Promise.resolve()
	}

	/**
	 * @deprecated use job spy instead
	 */
	public get processCalls(): JobData[] {
		return this._processCalls
	}

	/**
	 * @deprecated use job spy instead
	 */
	public clean(): void {
		this._processCalls = []
	}
}
