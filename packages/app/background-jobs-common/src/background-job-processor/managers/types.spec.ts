import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type { JobPayloadForQueue, QueueConfiguration, SupportedJobPayloads } from './types.ts'
import type { SupportedQueueIds } from './types.ts'

const SCHEMA_1 = z.object({
  id1: z.string(),
  metadata: z.object({ correlationId: z.string() }),
})
type Schema1 = z.infer<typeof SCHEMA_1>
const SCHEMA_2 = z.object({
  id2: z.string(),
  metadata: z.object({ correlationId: z.string() }),
})
type Schema2 = z.infer<typeof SCHEMA_2>

const supportedQueues = [
  {
    queueId: 'queue1',
    jobPayloadSchema: SCHEMA_1,
  },
  {
    queueId: 'queue2',
    jobPayloadSchema: SCHEMA_2,
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('managers types', () => {
  it('SupportedQueueIds', () => {
    expectTypeOf<'queue1' | 'queue2'>().toEqualTypeOf<SupportedQueueIds<SupportedQueues>>()
  })

  it('SupportedJobPayloads', () => {
    expectTypeOf<Schema1 | Schema2>().toEqualTypeOf<SupportedJobPayloads<SupportedQueues>>()
  })

  it('JobPayloadForQueue', () => {
    expectTypeOf<Schema1>().toEqualTypeOf<JobPayloadForQueue<SupportedQueues, 'queue1'>>()
    expectTypeOf<Schema2>().toEqualTypeOf<JobPayloadForQueue<SupportedQueues, 'queue2'>>()
  })
})
