import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { type JobDefinition, JobRegistry } from './JobRegistry.js'

const queueId1 = 'queue1'
const queueId2 = 'queue2'

const jobPayloadSchema = z.object({
  id: z.string(),
  value: z.string(),
  metadata: z.object({
    correlationId: z.string(),
  }),
})

const jobPayloadSchema2 = z.object({
  id: z.string(),
  value: z.string(),
  value2: z.string(),
  metadata: z.object({
    correlationId: z.string(),
  }),
})

const SUPPORTED_JOBS = [
  {
    queueId: queueId1,
    jobPayloadSchema,
  },
  {
    queueId: queueId2,
    jobPayloadSchema: jobPayloadSchema2,
  },
] as const satisfies JobDefinition[]

describe('JobRegistry', () => {
  let jobRegistry: JobRegistry<typeof SUPPORTED_JOBS>

  beforeEach(() => {
    jobRegistry = new JobRegistry(SUPPORTED_JOBS)
  })

  it('returns the correct job payload schema by queue ID', () => {
    const schema = jobRegistry.getJobPayloadSchemaByQueue(queueId1)
    expect(schema).toBe(jobPayloadSchema)
  })

  it('throws an error if queue ID is not supported', () => {
    // @ts-ignore
    expect(() => jobRegistry.getJobPayloadSchemaByQueue('invalidQueueId')).toThrowError()
  })

  it('correctly identifies supported queues', () => {
    expect(jobRegistry.isSupportedQueue(queueId1)).toBe(true)
    expect(jobRegistry.isSupportedQueue('invalidQueueId')).toBe(false)
  })
})
