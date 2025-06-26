import type { RedisConfig } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import { CommonBullmqFactory } from '../factories/CommonBullmqFactory.ts'
import type { BaseJobPayload } from '../types.ts'
import { AbstractBackgroundJobProcessor } from './AbstractBackgroundJobProcessor.ts'
import type { BackgroundJobProcessorDependencies } from './types.ts'

export class FakeBackgroundJobProcessor<
  JobData extends BaseJobPayload,
> extends AbstractBackgroundJobProcessor<JobData> {
  constructor(
    dependencies: Omit<
      BackgroundJobProcessorDependencies<JobData>,
      'bullmqFactory' | 'transactionObservabilityManager'
    >,
    queueName: string,
    redisConfig: RedisConfig,
    isTest = true,
    workerAutoRunEnabled = true,
  ) {
    super(
      {
        transactionObservabilityManager: {
          /* v8 ignore next 4 */
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
        queueId: queueName,
        ownerName: 'testOwner',
        isTest,
        workerOptions: { concurrency: 1 },
        lazyInitEnabled: false,
        redisConfig,
        workerAutoRunEnabled,
      },
    )
  }
  protected override process(_job: Job<JobData>): Promise<void> {
    return Promise.resolve()
  }
}
