import { CommonBullmqFactory } from '../factories/CommonBullmqFactory'
import type { BaseJobPayload } from '../types'

import type { RedisConfig } from '@lokalise/node-core'
import { Job } from 'bullmq'
import { AbstractBackgroundJobProcessor } from './AbstractBackgroundJobProcessor'
import type { BackgroundJobProcessorDependencies } from './types'

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
  ) {
    super(
      {
        transactionObservabilityManager: {
          start: () => {},
          startWithGroup: () => {},
          stop: () => {},
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
        redisConfig,
      },
    )
  }
  protected override process(_job: Job<JobData>): Promise<void> {
    return Promise.resolve()
  }
}
