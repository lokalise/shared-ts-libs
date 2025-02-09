import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  type JobPayloadForQueue,
  type QueueConfiguration,
  type SupportedQueueIds,
} from '../../src'

export class TestReturnValueBackgroundJobProcessorNew<
  Q extends QueueConfiguration[],
  T extends SupportedQueueIds<Q>,
  JobPayload extends JobPayloadForQueue<Q, T>,
  JobReturn = void,
> extends AbstractBackgroundJobProcessorNew<Q, T, JobPayload, JobReturn> {
  private readonly returnValue: JobReturn

  constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<Q, T, JobPayload, JobReturn>,
    queueId: T,
    redisConfig: RedisConfig,
    returnValue: JobReturn,
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: redisConfig,
    })
    this.returnValue = returnValue
  }

  protected override process(): Promise<JobReturn> {
    return Promise.resolve(this.returnValue)
  }
}
