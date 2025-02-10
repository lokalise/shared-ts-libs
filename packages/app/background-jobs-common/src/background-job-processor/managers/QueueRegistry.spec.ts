import type { JobsOptions, QueueOptions } from 'bullmq'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { QueueRegistry } from './QueueRegistry'
import type { QueueConfiguration } from './types'

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

const QUEUES = [
  {
    queueId: 'queue1',
    jobPayloadSchema,
    queueOptions: { skipMetasUpdate: true },
  },
  {
    queueId: 'queue2',
    jobPayloadSchema: jobPayloadSchema2,
    jobOptions: { attempts: 10 },
  },
] as const satisfies QueueConfiguration[]

describe('QueueRegistry', () => {
  let registry: QueueRegistry<typeof QUEUES, QueueOptions, JobsOptions>

  beforeEach(() => {
    registry = new QueueRegistry(QUEUES)
  })

  it('should register queue ids correctly', () => {
    expect(registry.queueIds).toEqual(new Set(['queue1', 'queue2']))
  })

  it('should return the correct config by queue id', () => {
    const config1 = registry.getQueueConfig('queue1')
    expect(config1).toBe(QUEUES[0])

    const config2 = registry.getQueueConfig('queue2')
    expect(config2).toBe(QUEUES[1])
  })

  it('should throw an error if queue id is not supported', () => {
    // @ts-expect-error - TS checks that only valid queue ids are passed
    expect(() => registry.getQueueConfig('invalidQueueId')).toThrowError()
  })
})
