import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions, QueueOptions } from 'bullmq'
import type { z } from 'zod'
import type { BaseJobPayload } from '../types'

export type QueueManagerConfig = {
  isTest: boolean
  lazyInitEnabled?: boolean
  redisConfig: RedisConfig
}

export type QueueConfiguration<
  QueueOptionsType extends QueueOptions = QueueOptions,
  JobOptionsType extends JobsOptions = JobsOptions,
> = {
  queueId: string
  queueOptions?: Omit<Partial<QueueOptionsType>, 'connection' | 'prefix'>
  jobPayloadSchema: z.ZodType<BaseJobPayload> // should extend BASE_JOB_PAYLOAD_SCHEMA
  jobOptions?: JobOptionsType
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
