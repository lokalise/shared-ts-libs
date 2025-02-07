import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions, QueueOptions } from 'bullmq'
import type { z } from 'zod'
import type { BASE_JOB_PAYLOAD_SCHEMA } from '../types'

export type QueueConfiguration = {
  queueId: string
  queueOptions?: QueueOptions // TODO: support QueuePro options
}

export type QueueManagerConfig = {
  isTest: boolean
  lazyInitEnabled?: boolean
  redisConfig: RedisConfig
}

// Utility type to ensure that JobDefinition.jobPayloadSchema is an extension of BASE_JOB_PAYLOAD_SCHEMA
type ExtendsBaseJobPayloadSchema = z.ZodSchema & {
  _input: z.infer<typeof BASE_JOB_PAYLOAD_SCHEMA>
}

export type JobDefinition<JobOptionsType extends JobsOptions = JobsOptions> = {
  queueId: string
  jobPayloadSchema: ExtendsBaseJobPayloadSchema
  options?: JobOptionsType
}

export type SupportedQueues<SupportedJobs extends JobDefinition[]> =
  SupportedJobs[number]['queueId']
