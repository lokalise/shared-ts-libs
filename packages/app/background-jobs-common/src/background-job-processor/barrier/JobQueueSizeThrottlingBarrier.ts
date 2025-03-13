import type { AbstractBackgroundJobProcessor } from '../processors/AbstractBackgroundJobProcessor.js'
import type { BaseJobPayload } from '../types.js'
import type { BarrierCallback } from './barrier.js'

export type ChildJobThrottlingBarrierConfig = {
  retryPeriodInMsecs: number
  maxQueueJobsInclusive: number
}

export type JobQueueSizeThrottlingBarrierContext = {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  throttledQueueJobProcessor: AbstractBackgroundJobProcessor<any>
}

/**
 * This barrier limits amount of jobs that can exist in a queue for a given job processor at a time.
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
