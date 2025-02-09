import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  type JobPayloadForQueue,
  type QueueConfiguration,
  type SupportedQueueIds,
} from '../../src'
import type { BarrierCallback } from '../../src'

export class TestBarrierBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
  JobPayload extends JobPayloadForQueue<Q, T>,
  JobReturn = void,
> extends AbstractBackgroundJobProcessorNew<Q, T, JobPayload, JobReturn> {
  constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<Q, T, JobPayload, JobReturn>,
    queueId: T,
    redisConfig: RedisConfig,
    barrier: BarrierCallback<JobPayloadForQueue<Q, T>>,
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: redisConfig,
      barrier,
    })
  }

  protected override process(): Promise<JobReturn> {
    return Promise.resolve({} as JobReturn)
  }
}
