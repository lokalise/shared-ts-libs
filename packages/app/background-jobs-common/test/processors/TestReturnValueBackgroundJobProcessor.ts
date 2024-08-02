import { generateMonotonicUuid } from '@lokalise/id-utils'

import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
} from '../../src'

export class TestReturnValueBackgroundJobProcessor<
  JobData extends BaseJobPayload,
  JobReturn,
> extends AbstractBackgroundJobProcessor<JobData, JobReturn> {
  private readonly returnValue: JobReturn

  constructor(
    dependencies: BackgroundJobProcessorDependencies<JobData, JobReturn>,
    redisConfig: RedisConfig,
    returnValue: JobReturn,
  ) {
    super(dependencies, {
      queueId: generateMonotonicUuid(),
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: redisConfig,
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
