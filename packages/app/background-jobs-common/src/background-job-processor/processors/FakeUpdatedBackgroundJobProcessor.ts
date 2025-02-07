import { CommonBullmqFactory } from '../factories/CommonBullmqFactory'
import type { BaseJobPayload } from '../types'

import type { RedisConfig } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import { AbstractUpdatedBackgroundJobProcessor } from './AbstractUpdatedBackgroundJobProcessor'
import type { BackgroundJobProcessorDependencies } from './types'

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
