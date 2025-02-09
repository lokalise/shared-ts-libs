import type { RedisConfig } from '@lokalise/node-core'
import type { Job } from 'bullmq'
import { CommonBullmqWorkerFactory } from '../factories/CommonBullmqWorkerFactory'
import type { QueueConfiguration, SupportedQueueIds } from '../managers/types'
import { AbstractBackgroundJobProcessorNew } from './AbstractBackgroundJobProcessorNew'
import type { BackgroundJobProcessorDependenciesNew } from './types'

export class FakeBackgroundJobProcessorNew<
  Queues extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues>,
> extends AbstractBackgroundJobProcessorNew<Queues, QueueId> {
  constructor(
    dependencies: Omit<
      BackgroundJobProcessorDependenciesNew<Queues, QueueId>,
      'bullmqFactory' | 'transactionObservabilityManager'
    >,
    queueId: QueueId,
    redisConfig: RedisConfig,
    isTest = true,
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
        workerFactory: new CommonBullmqWorkerFactory(),
      },
      {
        queueId,
        ownerName: 'testOwner',
        isTest,
        workerOptions: { concurrency: 1 },
        redisConfig,
      },
    )
  }
  protected override process(_job: Job<unknown>): Promise<void> {
    return Promise.resolve()
  }
}
