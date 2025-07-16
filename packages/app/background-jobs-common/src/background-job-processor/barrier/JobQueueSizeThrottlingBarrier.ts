import type { AbstractBackgroundJobProcessor } from '../processors/AbstractBackgroundJobProcessor.ts'
import type { BaseJobPayload } from '../types.ts'
import type { BarrierCallback } from './barrier.ts'

export type ChildJobThrottlingBarrierConfig = {
  retryPeriodInMsecs: number
  maxQueueJobsInclusive: number
}

export type JobQueueSizeThrottlingBarrierContext = {
  // biome-ignore lint/suspicious/noExplicitAny: type dependencies are not known at this point
  throttledQueueJobProcessor: AbstractBackgroundJobProcessor<any>
}

/**
 * This barrier limits the number of jobs that can exist in a queue for a given job processor at a time.
 * Note that for performance reasons it performs an optimistic check and can overflow in highly concurrent systems,
 * so it is recommended to use lower values for max queue jobs, to preserve a buffer for the overflow
 */
export function createJobQueueSizeThrottlingBarrier(
  config: ChildJobThrottlingBarrierConfig,
): BarrierCallback<BaseJobPayload, JobQueueSizeThrottlingBarrierContext> {
  return async (_job, context: JobQueueSizeThrottlingBarrierContext) => {
    const throttledQueueJobCount = await context.throttledQueueJobProcessor.getJobCount()

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
