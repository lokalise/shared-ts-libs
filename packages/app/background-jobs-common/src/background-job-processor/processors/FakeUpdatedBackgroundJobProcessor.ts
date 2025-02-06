import { CommonBullmqFactory } from '../factories/CommonBullmqFactory.js'
import type { BaseJobPayload } from '../types.js'

import type { RedisConfig } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import type { BackgroundJobProcessorDependencies } from './types.js'
import { AbstractUpdatedBackgroundJobProcessor } from './AbstractUpdatedBackgroundJobProcessor.js'

export class FakeUpdatedBackgroundJobProcessor<
  JobData extends BaseJobPayload,
> extends AbstractUpdatedBackgroundJobProcessor<JobData> {
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
