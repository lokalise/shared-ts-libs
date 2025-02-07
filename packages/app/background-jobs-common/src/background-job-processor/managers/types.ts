import type { RedisConfig } from '@lokalise/node-core'
import type { JobsOptions, QueueOptions } from 'bullmq'
import type { z } from 'zod'
import type { BaseJobPayload } from '../types'

export type QueueConfiguration<QueueOptionsType extends QueueOptions = QueueOptions> = {
  queueId: string
  queueOptions?: Omit<Partial<QueueOptionsType>, 'connection' | 'prefix'>
}

export type QueueManagerConfig = {
  isTest: boolean
  lazyInitEnabled?: boolean
  redisConfig: RedisConfig
}

export type JobDefinition<JobOptionsType extends JobsOptions = JobsOptions> = {
  queueId: string
  jobPayloadSchema: z.ZodType<BaseJobPayload> // should extend BASE_JOB_PAYLOAD_SCHEMA
  options?: JobOptionsType
}

export type SupportedQueues<SupportedJobs extends JobDefinition[]> =
  SupportedJobs[number]['queueId']

export type SupportedJobPayloads<Jobs extends JobDefinition[]> = z.infer<
  Jobs[number]['jobPayloadSchema']
>

/*
// TODO: Discuss with Igor
// Helper type to extract the inferred type from a Zod schema while preserving optionality
type InferExact<T extends z.ZodType<BaseJobPayload>> = T extends z.ZodObject<infer Shape>
  ? {
      [K in keyof Shape]: Shape[K] extends z.ZodTypeAny ? z.infer<Shape[K]> : never
    }
  : never
 */
export type JobPayloadForQueue<QueueId extends string, Jobs extends JobDefinition[]> = z.infer<
  Extract<Jobs[number], { queueId: QueueId }>['jobPayloadSchema']
>

// ------------------ Example for discussion
/*
const jobPayloadSchema = z.object({
  id: z.string(),
  value: z.string(),
  optional: z.string().optional(),
  metadata: z.object({
    correlationId: z.string(),
  }),
})

const jobPayloadSchema2 = z.object({
  id: z.string(),
  value2: z.string(),
  optional2: z.string().optional(),
  metadata: z.object({
    correlationId: z.string(),
  }),
})

const SUPPORTED_JOBS = [
  {
    queueId: 'queue1',
    jobPayloadSchema: jobPayloadSchema.strict(),
  },
  {
    queueId: 'queue2',
    jobPayloadSchema: jobPayloadSchema2,
  },
] as const satisfies JobDefinition[]

const jobRegistry = new JobRegistry(SUPPORTED_JOBS)
const queueManager = new FakeQueueManager([{ queueId: 'queue1' }], jobRegistry, {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  redisConfig: {} as any,
})

queueManager.schedule('queue1', {
  id: '1',
  value: 'test',
  optional: undefined,
  metadata: { correlationId: 'correlation_id' },
})
*/
