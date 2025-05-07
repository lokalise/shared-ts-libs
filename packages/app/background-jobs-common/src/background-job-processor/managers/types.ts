import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions, QueueOptions } from 'bullmq'
import type { z } from 'zod'
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
    /** Callback to allow building deduplication id base on job data*/
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
  jobPayloadSchema: z.ZodType<BaseJobPayload> // should extend JobPayload
  jobOptions?: JobOptionsWithDeduplicationIdBuilder<JobOptionsType>
}

export type SupportedQueueIds<Config extends QueueConfiguration[]> = Config[number]['queueId']

export type SupportedJobPayloads<Config extends QueueConfiguration[]> = z.infer<
  Config[number]['jobPayloadSchema']
>

type JobPayloadSchemaFoQueue<
  Config extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = Extract<Config[number], { queueId: QueueId }>['jobPayloadSchema']

export type JobPayloadInputForQueue<
  Config extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = z.input<JobPayloadSchemaFoQueue<Config, QueueId>>

export type JobPayloadForQueue<
  Config extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = z.infer<JobPayloadSchemaFoQueue<Config, QueueId>>
