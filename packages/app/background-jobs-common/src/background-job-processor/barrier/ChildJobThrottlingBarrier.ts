import type { AbstractBackgroundJobProcessor } from '../processors/AbstractBackgroundJobProcessor'
import type { BaseJobPayload } from '../types'
import type { BarrierCallback } from './barrier'

export type ChildJobThrottlingBarrierConfig = {
  retryPeriodInMsecs: number
  maxChildJobsInclusive: number
}

export type ChildJobThrottlingBarrierContext = {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  childJobProcessor: AbstractBackgroundJobProcessor<any>
}

/**
 * Limit amount of child jobs that can exist at a time.
 * Note that for performance reasons it performs an optimistic check and can overflow in highly concurrent systems,
 * so it is recommended to use lower values for max child jobs, to preserve a buffer for the overflow
 */
export function createChildJobThrottlingBarrier(
  config: ChildJobThrottlingBarrierConfig,
): BarrierCallback<BaseJobPayload, ChildJobThrottlingBarrierContext> {
  return async (_job, context: ChildJobThrottlingBarrierContext) => {
    const childJobCount = await context.childJobProcessor.getJobCount()

    if (childJobCount < config.maxChildJobsInclusive) {
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
