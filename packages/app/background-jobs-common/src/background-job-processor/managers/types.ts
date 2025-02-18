import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions, QueueOptions } from 'bullmq'
import type { z } from 'zod'
import type { BaseJobPayload } from '../types'

export type QueueManagerConfig = {
  isTest: boolean
  lazyInitEnabled?: boolean
  redisConfig: RedisConfig
}

type JobOptionsWithDeduplicationIdBuilder<JobOptionsType extends JobsOptions> = Omit<
  JobOptionsType,
  'deduplication'
> & {
  deduplication: Omit<JobOptionsType['deduplication'], 'id'> & {
    // biome-ignore lint/suspicious/noExplicitAny: We cannot infer type of JobData and we have run time validation so any is the most flexible option
    idBuilder: (JobData: any) => string
  }
}

export type QueueConfiguration<
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> = {
  queueId: string
  queueOptions?: Omit<QueueOptionsType, 'connection' | 'prefix'>
  jobPayloadSchema: z.ZodType<BaseJobPayload> // should extend JobPayload
  jobOptions?: JobOptionsWithDeduplicationIdBuilder<JobOptionsType>
}

export type SupportedQueueIds<Config extends QueueConfiguration[]> = Config[number]['queueId']

export type SupportedJobPayloads<Config extends QueueConfiguration[]> = z.infer<
  Config[number]['jobPayloadSchema']
>

export type JobPayloadForQueue<
  Config extends QueueConfiguration[],
  QueueId extends SupportedQueueIds<Config>,
> = z.infer<Extract<Config[number], { queueId: QueueId }>['jobPayloadSchema']>
