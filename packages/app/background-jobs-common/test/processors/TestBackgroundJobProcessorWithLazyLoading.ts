import type { RedisConfig } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
  CommonBullmqFactory,
} from '../../src'

export class TestBackgroundJobProcessorWithLazyLoading<
  JobData extends BaseJobPayload,
> extends AbstractBackgroundJobProcessor<JobData> {
  constructor(
    dependencies: Omit<
      BackgroundJobProcessorDependencies<JobData>,
      'bullmqFactory' | 'transactionObservabilityManager'
    >,
    redisConfig: RedisConfig,
  ) {
    super(
      {
        transactionObservabilityManager: {
          start: () => {},
          startWithGroup: () => {},
          stop: () => {},
          addCustomAttributes: () => {},
        },
        logger: dependencies.logger,
        errorReporter: dependencies.errorReporter,
        bullmqFactory: new CommonBullmqFactory(),
      },
      {
        queueId: 'TestBackgroundJobProcessorWithLazyLoading',
        ownerName: 'testOwner',
        isTest: true,
        workerOptions: { concurrency: 1 },
        redisConfig,
      },
    )
  }
  protected override process(_job: Job<JobData>): Promise<void> {
    return Promise.resolve()
  }
}
