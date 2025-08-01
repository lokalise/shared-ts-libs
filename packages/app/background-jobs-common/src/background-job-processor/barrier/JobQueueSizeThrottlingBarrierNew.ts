import type { QueueConfiguration, QueueManager, SupportedQueueIds } from '../managers/index.ts'
import type { BaseJobPayload } from '../types.ts'
import type { BarrierCallback } from './barrier.ts'

// biome-ignore lint/suspicious/noExplicitAny: type dependencies don't matter at this point
export type ChildJobThrottlingBarrierConfigNew<Queues extends QueueConfiguration<any, any>[]> = {
  retryPeriodInMsecs: number
  maxQueueJobsInclusive: number
  queueId: SupportedQueueIds<Queues>
}

// biome-ignore lint/suspicious/noExplicitAny: type dependencies don't matter at this point
export type JobQueueSizeThrottlingBarrierContextNew<Queues extends QueueConfiguration<any, any>[]> =
  {
    queueManager: QueueManager<Queues>
  }

/**
 * This barrier limits the number of jobs that can exist in a queue for a given job processor at a time.
 * Note that for performance reasons it performs an optimistic check and can overflow in highly concurrent systems,
 * so it is recommended to use lower values for max queue jobs, to preserve a buffer for the overflow
 */
export function createJobQueueSizeThrottlingBarrierNew<
  // biome-ignore lint/suspicious/noExplicitAny: type dependencies don't matter at this point
  Queues extends QueueConfiguration<any, any>[],
>(
  config: ChildJobThrottlingBarrierConfigNew<Queues>,
): BarrierCallback<BaseJobPayload, JobQueueSizeThrottlingBarrierContextNew<Queues>> {
  return async (_job, context: JobQueueSizeThrottlingBarrierContextNew<Queues>) => {
    const throttledQueueJobCount = await context.queueManager.getJobCount(config.queueId)

    if (throttledQueueJobCount < config.maxQueueJobsInclusive) {
      return {
        isPassing: true,
      }
    }

    return {
      isPassing: false,
      delayAmountInMs: config.retryPeriodInMsecs,
    }
  }
}
