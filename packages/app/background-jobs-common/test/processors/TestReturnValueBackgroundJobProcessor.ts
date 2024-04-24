import { generateMonotonicUuid } from '@lokalise/id-utils'

import {
	AbstractBackgroundJobProcessor,
	BackgroundJobProcessorDependencies,
	BaseJobPayload,
} from '../../src'

export class TestReturnValueBackgroundJobProcessor<
	JobData extends BaseJobPayload,
	JobReturn,
> extends AbstractBackgroundJobProcessor<JobData, JobReturn> {
	private readonly returnValue: JobReturn

	constructor(
		dependencies: BackgroundJobProcessorDependencies<JobData, JobReturn>,
		returnValue: JobReturn,
	) {
		super(dependencies, {
			queueId: generateMonotonicUuid(),
			isTest: true,
			workerOptions: { concurrency: 1 },
		})
		this.returnValue = returnValue
	}

	async schedule(jobData: JobData): Promise<string> {
		return super.schedule(jobData, { attempts: 1 })
	}

	protected override async process(): Promise<JobReturn> {
		return Promise.resolve(this.returnValue)
	}

	protected override onFailed(): Promise<void> {
		return Promise.resolve()
	}

	protected override onSuccess(): Promise<void> {
		return Promise.resolve()
	}
}
