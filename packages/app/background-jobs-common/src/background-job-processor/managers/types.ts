import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions, QueueOptions } from 'bullmq'
import type { z } from 'zod'
import type { BASE_JOB_PAYLOAD_SCHEMA } from '../types'

export type QueueConfiguration = {
  queueId: string
  queueOptions?: QueueOptions // TODO: support QueuePro options
}

export type QueueManagerConfig = {
  redisConfig: RedisConfig
  isTest: boolean
  lazyInitEnabled?: boolean
}

// Utility type to ensure that JobDefinition.jobPayloadSchema is an extension of BASE_JOB_PAYLOAD_SCHEMA
type ExtendsBaseJobPayloadSchema = z.ZodSchema & {
  _input: z.infer<typeof BASE_JOB_PAYLOAD_SCHEMA>
}

export type JobDefinition = {
  queueId: string
  jobPayloadSchema: ExtendsBaseJobPayloadSchema
  options?: JobsOptions // TODO: support JobPro options
}

export type SupportedQueues<SupportedJobs extends JobDefinition[]> =
  SupportedJobs[number]['queueId']

// Helper type to extract the inferred type from a Zod schema while preserving optionality
type InferExact<T extends z.ZodSchema> = T extends z.ZodObject<infer Shape>
  ? {
      [K in keyof Shape]: Shape[K] extends z.ZodTypeAny ? z.infer<Shape[K]> : never
    }
  : never

export type JobPayloadForQueue<Q extends string, Jobs extends JobDefinition[]> = InferExact<
  Extract<Jobs[number], { queueId: Q }>['jobPayloadSchema']
>
