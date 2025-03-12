import type { Job } from 'bullmq'
import type { BaseJobPayload, SafeJob } from '../types.js'

export type BarrierResult = BarrierResultPositive | BarrierResultNegative

export type BarrierResultPositive = {
  isPassing: true
  delayAmountInMs?: never
}

export type BarrierResultNegative = {
  isPassing: false
  delayAmountInMs: number
}

export type BarrierCallback<
  JobPayload extends BaseJobPayload,
  ExecutionContext = void,
  JobReturn = unknown,
  JobType extends SafeJob<JobPayload, JobReturn> = Job<JobPayload, JobReturn>,
> = (job: JobType, context: ExecutionContext) => Promise<BarrierResult>
