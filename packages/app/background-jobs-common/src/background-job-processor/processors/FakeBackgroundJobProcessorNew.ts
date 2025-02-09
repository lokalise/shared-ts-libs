import { CommonBullmqFactory } from '../factories/CommonBullmqFactory'
import type { BaseJobPayload } from '../types'

import type { RedisConfig } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import type { QueueConfiguration } from '../managers/types'
import { AbstractBackgroundJobProcessorNew } from './AbstractBackgroundJobProcessorNew'
import type { BackgroundJobProcessorDependenciesNew } from './types'

export class FakeBackgroundJobProcessorNew<
  Queues extends QueueConfiguration[],
  JobData extends BaseJobPayload,
> extends AbstractBackgroundJobProcessorNew<Queues, JobData> {
  constructor(
    dependencies: Omit<
      BackgroundJobProcessorDependenciesNew<Queues, JobData>,
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
        queueManager: dependencies.queueManager,
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
