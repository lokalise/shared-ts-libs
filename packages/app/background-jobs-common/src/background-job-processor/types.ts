import type { FinishedStatus, Job, JobsOptions, Queue } from 'bullmq'

import type { CommonLogger } from '@lokalise/node-core'

export interface RequestContext {
  logger: CommonLogger
  reqId: string
}

export type JobFinalState = FinishedStatus
export type BaseJobPayload = { metadata: { correlationId: string } }

// "scripts" field is incompatible between free and pro versions, and it's not particularly important
// biome-ignore lint/suspicious/noExplicitAny: it's okay
export type SafeJob<T = any, R = any, N extends string = string> = Omit<
  Job<T, R, N>,
  'scripts' | 'waitUntilFinished'
> & {
  // biome-ignore lint/suspicious/noExplicitAny: QueueEventsPro and QueueEvents are not compatible, unfortunately
  waitUntilFinished(queueEvents: any, ttl?: number): Promise<R>
}

export type SafeQueue<
  // biome-ignore lint/correctness/noUnusedVariables: this is kept for backwards compatibility reasons, let's drop it in semver major
  JobsOptionsType = JobsOptions,
  // biome-ignore lint/suspicious/noExplicitAny: it's okay
  DataType = any,
  // biome-ignore lint/suspicious/noExplicitAny: it's okay
  ResultType = any,
  NameType extends string = string,
> = Queue<DataType, ResultType, NameType>

export type BullmqProcessor<
  J extends SafeJob<T, R, N>,
  // biome-ignore lint/suspicious/noExplicitAny: it's okay
  T = any,
  // biome-ignore lint/suspicious/noExplicitAny: it's okay
  R = any,
  N extends string = string,
> = (job: J, token?: string) => Promise<R>
