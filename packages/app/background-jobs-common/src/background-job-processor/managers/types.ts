import type { RedisConfig } from '@lokalise/node-core'
import type { Job, JobsOptions, Queue, QueueOptions } from 'bullmq'
import type { z } from 'zod'
import { type BaseJobPayload } from '../types.ts'

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
