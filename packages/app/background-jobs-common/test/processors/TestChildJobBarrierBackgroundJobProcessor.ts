import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import {
  AbstractBackgroundJobProcessor,
  type BackgroundJobProcessorDependencies,
  type BarrierCallback,
  type BaseJobPayload,
  type ChildJobThrottlingBarrierContext,
  type SafeJob,
} from '../../src'
import { TestLongStalledBackgroundJobProcessor } from './TestLongStalledBackgroundJobProcessor'

export class TestChildJobBarrierBackgroundJobProcessor<
  JobData extends BaseJobPayload,
  JobReturn,
> extends AbstractBackgroundJobProcessor<JobData, JobReturn, ChildJobThrottlingBarrierContext> {
  public childJobProcessor: TestLongStalledBackgroundJobProcessor
  constructor(
    dependencies: BackgroundJobProcessorDependencies<JobData, JobReturn>,
    redisConfig: RedisConfig,
    barrier: BarrierCallback<JobData, ChildJobThrottlingBarrierContext>,
  ) {
    super(dependencies, {
      queueId: generateMonotonicUuid(),
      ownerName: 'test',
      isTest: true,
      workerOptions: { concurrency: 1 },
      redisConfig: redisConfig,
      barrier,
    })
    // @ts-ignore
    this.childJobProcessor = new TestLongStalledBackgroundJobProcessor(dependencies, redisConfig)
  }

  async start(): Promise<void> {
    await super.start()
    await this.childJobProcessor.start()
  }

  async dispose(): Promise<void> {
    await super.dispose()
    await this.childJobProcessor.dispose()
  }

  protected override resolveExecutionContext(): ChildJobThrottlingBarrierContext {
    return {
      childJobProcessor: this.childJobProcessor,
    }
  }

  schedule(jobData: JobData): Promise<string> {
    return super.schedule(jobData, { attempts: 1 })
  }

  protected override async process(job: SafeJob<JobData>): Promise<JobReturn> {
    await this.childJobProcessor.schedule({
      id: job.id,
      metadata: {
        correlationId: 'dummy',
      },
    })
    return Promise.resolve({} as JobReturn)
  }
}
