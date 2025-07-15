import type { QueueConfiguration, QueueManager, SupportedQueueIds } from '../managers/index.js'
import type { BaseJobPayload } from '../types.ts'
import type { BarrierCallback } from './barrier.ts'

export type ChildJobThrottlingBarrierConfigNew<Queues extends QueueConfiguration<any, any>[]> = {
  retryPeriodInMsecs: number
  maxQueueJobsInclusive: number
  queueId: SupportedQueueIds<Queues>
}

export type JobQueueSizeThrottlingBarrierContextNew = {
  queueManager: QueueManager<any>
}

/**
 * This barrier limits the number of jobs that can exist in a queue for a given job processor at a time.
 * Note that for performance reasons it performs an optimistic check and can overflow in highly concurrent systems,
 * so it is recommended to use lower values for max queue jobs, to preserve a buffer for the overflow
 */
export function createJobQueueSizeThrottlingBarrierNew<
  Queues extends QueueConfiguration<any, any>[],
>(
  config: ChildJobThrottlingBarrierConfigNew<Queues>,
): BarrierCallback<BaseJobPayload, JobQueueSizeThrottlingBarrierContextNew> {
  return async (_job, context: JobQueueSizeThrottlingBarrierContextNew) => {
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
