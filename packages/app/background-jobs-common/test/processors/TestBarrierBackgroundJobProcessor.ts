import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisOptions } from 'ioredis'
import type { BarrierCallback } from '../../src/background-job-processor/barrier/barrier.ts'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
} from '../../src/index.ts'

export class TestBarrierBackgroundJobProcessor<
  JobData extends BaseJobPayload,
  JobReturn,
> extends AbstractBackgroundJobProcessor<JobData, JobReturn> {
  constructor(
    dependencies: BackgroundJobProcessorDependencies<JobData, JobReturn>,
    redisConfig: RedisOptions,
    barrier: BarrierCallback<JobData>,
  ) {
    super(dependencies, {
      queueId: generateMonotonicUuid(),
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: redisConfig,
      barrier,
    })
  }

  override schedule(jobData: JobData): Promise<string> {
    return super.schedule(jobData, { attempts: 1 })
  }

  protected override process(): Promise<JobReturn> {
    return Promise.resolve({} as JobReturn)
  }
}
