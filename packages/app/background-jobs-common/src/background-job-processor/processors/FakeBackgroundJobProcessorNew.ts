import type { Job } from 'bullmq'
import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.js'
import type { QueueConfiguration, SupportedQueueIds } from '../managers/types.js'
import { AbstractBackgroundJobProcessorNew } from './AbstractBackgroundJobProcessorNew.js'
import type { BackgroundJobProcessorDependenciesNew } from './types.js'

export class FakeBackgroundJobProcessorNew<
  Queues extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues>,
> extends AbstractBackgroundJobProcessorNew<Queues, QueueId> {
  constructor(
    dependencies: Omit<
      BackgroundJobProcessorDependenciesNew<Queues, QueueId>,
      'workerFactory' | 'transactionObservabilityManager'
    >,
    queueId: QueueId,
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
        workerFactory: new CommonBullmqFactoryNew(),
      },
      {
        queueId,
        ownerName: 'testOwner',
        workerOptions: { concurrency: 1 },
      },
    )
  }
  protected override process(_job: Job<unknown>): Promise<void> {
    return Promise.resolve()
  }
}
