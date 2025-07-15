import { z } from 'zod/v4'
import type { JobQueueSizeThrottlingBarrierContextNew } from '../../../src/background-job-processor/barrier/JobQueueSizeThrottlingBarrierNew.js'
import type { QueueConfiguration } from '../../../src/index.js'
import {
  AbstractBackgroundJobProcessorNew,
  type BackgroundJobProcessorDependenciesNew,
  type BarrierCallback,
  type JobPayloadForQueue,
  type SafeJob,
} from '../../../src/index.ts'

const schema = z.object({
  id: z.string(),
  metadata: z.object({ correlationId: z.string() }),
})

export const barrierSupportedQueues = [
  {
    queueId: 'queue',
    jobPayloadSchema: schema,
  },
  {
    queueId: 'forever_reschedule_queue',
    jobPayloadSchema: schema,
  },
] as const satisfies QueueConfiguration[]

export type BarrierSupportedQueues = typeof barrierSupportedQueues
export class TestQueueSizeJobBarrierBackgroundJobProcessorNew extends AbstractBackgroundJobProcessorNew<
  BarrierSupportedQueues,
  'queue',
  void,
  JobQueueSizeThrottlingBarrierContextNew
> {
  constructor(
    dependencies: BackgroundJobProcessorDependenciesNew<BarrierSupportedQueues, 'queue'>,
    barrier: BarrierCallback<
      JobPayloadForQueue<BarrierSupportedQueues, 'queue'>,
      JobQueueSizeThrottlingBarrierContextNew
    >,
  ) {
    super(dependencies, {
      queueId: 'queue',
      ownerName: 'test',
      workerOptions: { concurrency: 1 },
      barrier,
    })
  }

  override async start(): Promise<void> {
    await super.start()
  }

  override async dispose(): Promise<void> {
    await super.dispose()
  }

  protected override resolveExecutionContext(): JobQueueSizeThrottlingBarrierContextNew {
    return {
      queueManager: this.queueManager,
    }
  }

  protected override async process(
    job: SafeJob<JobPayloadForQueue<BarrierSupportedQueues, 'queue'>>,
  ): Promise<void> {
    await this.queueManager.schedule('forever_reschedule_queue', job.data)
    return Promise.resolve()
  }
}
