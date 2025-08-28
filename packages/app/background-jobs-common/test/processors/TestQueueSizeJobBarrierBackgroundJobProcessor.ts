import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BarrierCallback,
  type BaseJobPayload,
  type JobQueueSizeThrottlingBarrierContext,
  type SafeJob,
} from '../../src/index.ts'
import { TestForeverRescheduledBackgroundJobProcessor } from './TestForeverRescheduledBackgroundJobProcessor.ts'

export class TestQueueSizeJobBarrierBackgroundJobProcessor<
  JobData extends BaseJobPayload,
  JobReturn,
> extends AbstractBackgroundJobProcessor<JobData, JobReturn, JobQueueSizeThrottlingBarrierContext> {
  public throttledQueueJobProcessor: TestForeverRescheduledBackgroundJobProcessor
  constructor(
    dependencies: BackgroundJobProcessorDependencies<JobData, JobReturn>,
    redisConfig: RedisConfig,
    barrier: BarrierCallback<JobData, JobQueueSizeThrottlingBarrierContext>,
  ) {
    super(dependencies, {
      queueId: generateMonotonicUuid(),
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: redisConfig,
      barrier,
    })
    this.throttledQueueJobProcessor = new TestForeverRescheduledBackgroundJobProcessor(
      // @ts-expect-error
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

  protected override resolveExecutionContext(): JobQueueSizeThrottlingBarrierContext {
    return {
      throttledQueueJobProcessor: this.throttledQueueJobProcessor,
    }
  }

  override schedule(jobData: JobData): Promise<string> {
    return super.schedule(jobData, { attempts: 1 })
  }

  protected override async process(job: SafeJob<JobData>): Promise<JobReturn> {
    await this.throttledQueueJobProcessor.schedule({
      id: job.id,
      metadata: {
        correlationId: 'dummy',
      },
    })
    return Promise.resolve({} as JobReturn)
  }
}
