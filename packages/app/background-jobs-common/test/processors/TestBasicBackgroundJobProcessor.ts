import type { Job } from 'bullmq'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorConfig,
  type BackgroundJobProcessorDependencies,
  type BaseJobPayload,
  CommonBullmqFactory,
} from '../../src/index.ts'

// this is a copy of the FakeBackgroundJobProcessor, we do not want to extend it more as it will be removed with old processors
export class TestBasicBackgroundJobProcessor<
  JobData extends BaseJobPayload,
> extends AbstractBackgroundJobProcessor<JobData> {
  constructor(
    dependencies: Omit<
      BackgroundJobProcessorDependencies<JobData>,
      'bullmqFactory' | 'transactionObservabilityManager'
    >,
    options: Pick<
      BackgroundJobProcessorConfig,
      'redisConfig' | 'queueId' | 'bullDashboardGrouping'
    >,
  ) {
    super(
      {
        transactionObservabilityManager: {
          /* v8 ignore start */
          start: () => {},
          startWithGroup: () => {},
          stop: () => {},
          addCustomAttributes: () => {},
          /* v8 ignore stop */
        },
        logger: dependencies.logger,
        errorReporter: dependencies.errorReporter,
        bullmqFactory: new CommonBullmqFactory(),
      },
      {
        queueId: options.queueId,
        ownerName: 'testOwner',
        isTest: true,
        workerOptions: { concurrency: 1 },
        lazyInitEnabled: false,
        redisConfig: options.redisConfig,
        bullDashboardGrouping: options.bullDashboardGrouping,
      },
    )
  }
  protected override process(_job: Job<JobData>): Promise<void> {
    return Promise.resolve()
  }
}
