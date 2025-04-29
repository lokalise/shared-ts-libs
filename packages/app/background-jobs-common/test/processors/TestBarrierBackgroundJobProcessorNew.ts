import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  type JobPayloadForQueue,
  type QueueConfiguration,
  type SupportedQueueIds,
} from '../../src/index.ts'
import type { BarrierCallback } from '../../src/index.ts'

export class TestBarrierBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
  JobReturn = void,
> extends AbstractBackgroundJobProcessorNew<Q, T, JobReturn> {
  constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<Q, T, JobReturn>,
    queueId: T,
    barrier: BarrierCallback<JobPayloadForQueue<Q, T>>,
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      workerOptions: { concurrency: 1 },
      barrier,
    })
  }

  protected override process(): Promise<JobReturn> {
    return Promise.resolve({} as JobReturn)
  }
}
