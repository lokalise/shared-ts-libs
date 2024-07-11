import { generateMonotonicUuid } from '@lokalise/id-utils'

import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
} from '../../src'
import {getTestRedisConfig} from "../setup";

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
			ownerName: 'test',
			isTest: true,
			workerOptions: { concurrency: 1 },
			redisConfig: getTestRedisConfig(),
		})
		this.returnValue = returnValue
	}

  schedule(jobData: JobData): Promise<string> {
    return super.schedule(jobData, { attempts: 1 })
  }

  protected override process(): Promise<JobReturn> {
    return Promise.resolve(this.returnValue)
  }
}
