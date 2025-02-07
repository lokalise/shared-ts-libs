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

/*
// TODO: Discuss with Igor
// Helper type to extract the inferred type from a Zod schema while preserving optionality
type InferExact<T extends z.ZodType<BaseJobPayload>> = T extends z.ZodObject<infer Shape>
  ? {
      [K in keyof Shape]: Shape[K] extends z.ZodTypeAny ? z.infer<Shape[K]> : never
    }
  : never
 */
export type JobPayloadForQueue<
  QueueId extends string,
  Config extends QueueConfiguration[],
> = z.infer<Extract<Config[number], { queueId: QueueId }>['jobPayloadSchema']>

/*
// ------------------ Example for discussion
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

const _QUEUES = [
  {
    queueId: 'queue1',
    jobPayloadSchema: jobPayloadSchema.strict(),
  },
  {
    queueId: 'queue2',
    jobPayloadSchema: jobPayloadSchema2,
  },
] as const satisfies QueueConfiguration[]

const queueManager = new FakeQueueManager(
  [
    {
      queueId: 'queue1',
      jobPayloadSchema: jobPayloadSchema.strict(),
    },
    {
      queueId: 'queue2',
      jobPayloadSchema: jobPayloadSchema2,
    },
  ] as const,
  {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    redisConfig: {} as any,
  },
)

queueManager.schedule('queue1', {
  id: '1',
  value: 'test',
  optional: undefined,
  metadata: { correlationId: 'correlation_id' },
})
*/
