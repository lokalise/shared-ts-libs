import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  type BarrierCallback,
  type QueueConfiguration,
  type SafeJob, type SupportedJobPayloads, type SupportedQueueIds,
} from '../../src/index.ts'
import { TestForeverRescheduledBackgroundJobProcessor } from './TestForeverRescheduledBackgroundJobProcessor.ts'
import type {
  JobQueueSizeThrottlingBarrierContextNew
} from "../../src/background-job-processor/barrier/JobQueueSizeThrottlingBarrierNew.js";

export class TestQueueSizeJobBarrierBackgroundJobProcessorNew<
    Q extends QueueConfiguration[],
    T extends SupportedQueueIds<Q>,
> extends AbstractBackgroundJobProcessorNew<Q, T, void, JobQueueSizeThrottlingBarrierContextNew> {
  public throttledQueueJobProcessor: TestForeverRescheduledBackgroundJobProcessor
  constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<Q, T>,
    queueId: T,
    redisConfig: RedisConfig,
    barrier: BarrierCallback<SupportedJobPayloads<Q>, JobQueueSizeThrottlingBarrierContextNew>,
  ) {
    super(dependencies, {
      queueId,
      ownerName: 'test',
      workerOptions: { concurrency: 1 },
      barrier,
    })
    this.throttledQueueJobProcessor = new TestForeverRescheduledBackgroundJobProcessor(
      // @ts-ignore
      dependencies,
      redisConfig,
    )
  }

  override async start(): Promise<void> {
    await super.start()
    await this.throttledQueueJobProcessor.start()
  }

  override async dispose(): Promise<void> {
    await super.dispose()
    await this.throttledQueueJobProcessor.dispose()
  }

  protected override resolveExecutionContext(): JobQueueSizeThrottlingBarrierContextNew {
    return {
      queueManager: this.queueManager,
    }
  }

  protected override async process(job: SafeJob<SupportedJobPayloads<Q>>): Promise<void> {
    await this.throttledQueueJobProcessor.schedule({
      id: job.id,
      metadata: {
        correlationId: 'dummy',
      },
    })
    return Promise.resolve()
  }
}
