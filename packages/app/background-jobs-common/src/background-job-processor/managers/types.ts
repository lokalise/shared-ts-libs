import type { RedisConfig } from '@lokalise/node-core'
import type { Job, JobsOptions, Queue, QueueOptions } from 'bullmq'
import type { z } from 'zod/v4'
import type { BaseJobPayload } from '../types.ts'

export type QueueManagerConfig = {
  isTest: boolean
  lazyInitEnabled?: boolean
  redisConfig: RedisConfig
}

type JobOptionsWithDeduplicationIdBuilder<JobOptionsType extends JobsOptions> = Omit<
  JobOptionsType,
  'deduplication'
> & {
  deduplication?: Omit<NonNullable<JobOptionsType['deduplication']>, 'id'> & {
    /** @deprecated Use `jobOptions` as a function with payload as an argument instead. */
    // biome-ignore lint/suspicious/noExplicitAny: We cannot infer type of JobData, but we have run time validation
    idBuilder: (JobData: any) => string
  }
}

export type QueueConfiguration<
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> = {
  queueId: string
  /** Used to compose the queue name and allow bull dashboard grouping feature */
  bullDashboardGrouping?: string[]
  queueOptions?: Omit<QueueOptionsType, 'connection' | 'prefix'>
  jobPayloadSchema: z.ZodType<BaseJobPayload>
  jobOptions?:
    | JobOptionsWithDeduplicationIdBuilder<JobOptionsType>
    // biome-ignore lint/suspicious/noExplicitAny: We cannot infer type of payload, but we have run time validation
    | ((payload: any) => JobOptionsType)
}

export type SupportedQueueIds<Config extends QueueConfiguration[]> = Config[number]['queueId']

export type SupportedJobPayloads<Config extends QueueConfiguration[]> = z.infer<
  Config[number]['jobPayloadSchema']
>

type JobPayloadSchemaForQueue<
  Config extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = Extract<Config[number], { queueId: QueueId }>['jobPayloadSchema']

export type JobPayloadInputForQueue<
  Config extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = z.input<JobPayloadSchemaForQueue<Config, QueueId>>

export type JobPayloadForQueue<
  Config extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = z.infer<JobPayloadSchemaForQueue<Config, QueueId>>

export type ProtectedQueue<
  JobPayload extends BaseJobPayload,
  JobReturn = void,
  QueueType = Queue<JobPayload, JobReturn>,
> = Omit<QueueType, 'close' | 'disconnect' | 'obliterate' | 'clean' | 'drain'>

export type JobInQueue<JobData extends object, jobReturn> = Pick<
  Job<JobData, jobReturn>,
  | 'id'
  | 'data'
  | 'attemptsMade'
  | 'attemptsStarted'
  | 'progress'
  | 'returnvalue'
  | 'failedReason'
  | 'finishedOn'
  | 'getState'
>

export type JobsPaginatedResponse<JobData extends BaseJobPayload, jobReturn> = {
  jobs: JobInQueue<JobData, jobReturn>[]
  hasMore: boolean
}

/**
 * Options accepted on a child flow node. Mirrors BullMQ's `FlowChildJob.opts`:
 * `debounce`, `deduplication`, `parent` and `repeat` are not supported on children.
 */
export type FlowChildJobOptions = Omit<
  JobsOptions,
  'debounce' | 'deduplication' | 'parent' | 'repeat'
>

/**
 * Options accepted on a root flow node. Mirrors BullMQ's `FlowJob.opts`:
 * `repeat` is not supported on flow roots (use `Queue.add` for repeatable jobs).
 */
export type FlowRootJobOptions = Omit<JobsOptions, 'repeat'>

/**
 * Typed flow child node. The `queueId` discriminates which queue's payload
 * schema is required on `data`.
 */
export type FlowChildJobInput<
  Queues extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues> = SupportedQueueIds<Queues>,
> = {
  [Id in QueueId]: {
    queueId: Id
    /** Defaults to `queueId` when omitted, matching `QueueManager.schedule`. */
    name?: string
    data: JobPayloadInputForQueue<Queues, Id>
    opts?: FlowChildJobOptions
    children?: FlowChildJobInput<Queues>[]
  }
}[QueueId]

/**
 * Typed flow root node. Root jobs may carry `deduplication`/`debounce`
 * (children may not — see {@link FlowChildJobInput}).
 */
export type FlowJobInput<
  Queues extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Queues> = SupportedQueueIds<Queues>,
> = {
  [Id in QueueId]: {
    queueId: Id
    name?: string
    data: JobPayloadInputForQueue<Queues, Id>
    opts?: FlowRootJobOptions
    children?: FlowChildJobInput<Queues>[]
  }
}[QueueId]

/** Configuration accepted by `FlowManager` — distinct from `QueueManagerConfig`
 * because `isTest` and `redisConfig` are inherited from the paired `QueueManager`. */
export type FlowManagerConfig = {
  lazyInitEnabled?: boolean
}
