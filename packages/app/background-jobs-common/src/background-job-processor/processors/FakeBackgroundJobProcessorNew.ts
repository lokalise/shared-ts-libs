import type { Job } from 'bullmq'
import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.ts'
import type { QueueConfiguration, SupportedQueueIds } from '../managers/types.ts'
import { AbstractBackgroundJobProcessorNew } from './AbstractBackgroundJobProcessorNew.ts'
import type { BackgroundJobProcessorDependenciesNew } from './types.ts'

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
          /* v8 ignore start */
          start: () => {},
          startWithGroup: () => {},
          stop: () => {},
          addCustomAttributes: () => {},
          /* v8 ignore stop */
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
