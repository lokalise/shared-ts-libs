import type { Job } from 'bullmq'

import {
	BackgroundJobProcessorDependencies,
	BaseJobPayload,
	FakeBackgroundJobProcessor,
	RequestContext,
} from '../../src'

type TestSuccessBackgroundJobProcessorData = {
	id?: string
} & BaseJobPayload

export class TestSuccessBackgroundJobProcessor<
	T extends TestSuccessBackgroundJobProcessorData,
> extends FakeBackgroundJobProcessor<T> {
	private onSuccessCounter: number = 0
	private onSuccessCall: (job: Job<T>) => void

	constructor(
		dependencies: BackgroundJobProcessorDependencies<T>,
		queueName: string,
		isTest = true,
	) {
		super(dependencies, queueName, isTest)
	}

	async schedule(jobData: T): Promise<string> {
		return super.schedule(jobData, { attempts: 1, removeOnComplete: false })
	}

	protected override async process(): Promise<void> {
		return Promise.resolve()
	}

	protected override onFailed(): Promise<void> {
		return Promise.resolve()
	}

	protected override onSuccess(job: Job<T>, requestContext: RequestContext): Promise<void> {
		this.onSuccessCounter += 1
		this.onSuccessCall(job)
		return super.onSuccess(job, requestContext)
	}

	override async purgeJobData(job: Job<T>): Promise<void> {
		return super.purgeJobData(job)
	}

	set onSuccessHook(hook: (job: Job<T>) => void) {
		this.onSuccessCall = hook
	}

	get onSuccessCallsCounter(): number {
		return this.onSuccessCounter
	}
}
