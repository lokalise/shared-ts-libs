import { afterEach, beforeEach, describe, expect } from 'vitest'
import { z } from 'zod'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory'
import type { FakeQueueManager } from './FakeQueueManager'
import type { QueueConfiguration } from './types'

const DEFAULT_PAYLOAD_SCHEMA = z.object({
  test: z.string(),
  metadata: z.object({ correlationId: z.string() }),
})

const supportedQueues = [
  {
    queueId: 'queue_valid',
    jobPayloadSchema: z.object({
      id: z.string(),
      value: z.string(),
      metadata: z.object({ correlationId: z.string() }),
    }),
    jobOptions: {
      deduplication: {
        idBuilder: (jobData: any) => `${jobData.id}:${jobData.value}`,
        ttl: 500,
      },
    },
  },
  {
    queueId: 'queue_idBuilder_error',
    jobPayloadSchema: DEFAULT_PAYLOAD_SCHEMA,
    jobOptions: {
      deduplication: {
        idBuilder: () => {
          throw new Error('Error in idBuilder')
        },
      },
    },
  },
  {
    queueId: 'queue_idBuilder_returns_nullable',
    jobPayloadSchema: DEFAULT_PAYLOAD_SCHEMA,
    jobOptions: {
      deduplication: {
        idBuilder: () => (Math.random() < 0.5 ? null : undefined) as any, // Randomly return null or undefined
      },
    },
  },
  {
    queueId: 'queue_idBuilder_returns_empty',
    jobPayloadSchema: DEFAULT_PAYLOAD_SCHEMA,
    jobOptions: {
      deduplication: {
        idBuilder: () => '   ',
      },
    },
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('QueueManager - deduplication', () => {
  let factory: TestDependencyFactory
  let queueManager: FakeQueueManager<SupportedQueues>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    const deps = factory.createNew(supportedQueues)
    queueManager = deps.queueManager

    await factory.clearRedis()
  })

  afterEach(async () => {
    await factory.dispose()
  })

  describe('schedule', () => {
    it('should throw error if idBuilder throws error', async () => {
      await expect(
        queueManager.schedule('queue_idBuilder_error', {
          test: 'test',
          metadata: { correlationId: 'correlationId' },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot('[Error: Error in idBuilder]')
    })

    it('should throw error if idBuilder returns nullable', async () => {
      await expect(
        queueManager.schedule('queue_idBuilder_returns_nullable', {
          test: 'test',
          metadata: { correlationId: 'correlationId' },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot('[Error: Invalid deduplication id]')
    })

    it('should throw error if idBuilder returns empty', async () => {
      await expect(
        queueManager.schedule('queue_idBuilder_returns_empty', {
          test: 'test',
          metadata: { correlationId: 'correlationId' },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot('[Error: Invalid deduplication id]')
    })

    it('should schedule job using deduplication idBuilder', async () => {
      const jobId = await queueManager.schedule('queue_valid', {
        id: 'myId',
        value: 'myValue',
        metadata: { correlationId: 'correlationId' },
      })

      const job = await queueManager.getQueue('queue_valid').getJob(jobId)
      expect(job).toBeDefined()
      expect(job!.opts.deduplication).toMatchObject({
        id: 'myId:myValue',
        ttl: 500,
      })
    })

    it('should schedule job respecting options deduplication id', async () => {
      const jobId = await queueManager.schedule(
        'queue_valid',
        {
          id: 'myId',
          value: 'myValue',
          metadata: { correlationId: 'correlationId' },
        },
        { deduplication: { id: 'newId', ttl: 10 } },
      )

      const job = await queueManager.getQueue('queue_valid').getJob(jobId)
      expect(job).toBeDefined()
      expect(job!.opts.deduplication).toEqual({ id: 'newId', ttl: 10 })
    })
  })

  describe('scheduleBulk', () => {
    it('should throw error if idBuilder throws error', async () => {
      await expect(
        queueManager.scheduleBulk('queue_idBuilder_error', [
          {
            test: 'test',
            metadata: { correlationId: 'correlationId' },
          },
        ]),
      ).rejects.toThrowErrorMatchingInlineSnapshot('[Error: Error in idBuilder]')
    })

    it('should throw error if idBuilder returns nullable', async () => {
      await expect(
        queueManager.scheduleBulk('queue_idBuilder_returns_nullable', [
          {
            test: 'test',
            metadata: { correlationId: 'correlationId' },
          },
        ]),
      ).rejects.toThrowErrorMatchingInlineSnapshot('[Error: Invalid deduplication id]')
    })

    it('should throw error if idBuilder returns empty', async () => {
      await expect(
        queueManager.scheduleBulk('queue_idBuilder_returns_empty', [
          {
            test: 'test',
            metadata: { correlationId: 'correlationId' },
          },
        ]),
      ).rejects.toThrowErrorMatchingInlineSnapshot('[Error: Invalid deduplication id]')
    })

    it('should schedule job using deduplication idBuilder', async () => {
      const jobIds = await queueManager.scheduleBulk('queue_valid', [
        {
          id: 'myId',
          value: 'myValue',
          metadata: { correlationId: 'correlationId' },
        },
      ])
      expect(jobIds).toHaveLength(1)

      const job = await queueManager.getQueue('queue_valid').getJob(jobIds[0])
      expect(job).toBeDefined()
      expect(job!.opts.deduplication).toMatchObject({
        id: 'myId:myValue',
        ttl: 500,
      })
    })

    it('should schedule job respecting options deduplication id', async () => {
      const jobIds = await queueManager.scheduleBulk(
        'queue_valid',
        [
          {
            id: 'myId',
            value: 'myValue',
            metadata: { correlationId: 'correlationId' },
          },
        ],
        { deduplication: { id: 'newId', ttl: 10 } },
      )
      expect(jobIds).toHaveLength(1)

      const job = await queueManager.getQueue('queue_valid').getJob(jobIds[0])
      expect(job).toBeDefined()
      expect(job!.opts.deduplication).toEqual({ id: 'newId', ttl: 10 })
    })

    it('should scheduleBulk building deduplication id for each job', async () => {
      const jobIds = await queueManager.scheduleBulk('queue_valid', [
        {
          id: 'myId1',
          value: 'myValue1',
          metadata: { correlationId: 'correlationId' },
        },
        {
          id: 'myId2',
          value: 'myValue2',
          metadata: { correlationId: 'correlationId' },
        },
      ])
      expect(jobIds).toHaveLength(2)

      const job1 = await queueManager.getQueue('queue_valid').getJob(jobIds[0])
      expect(job1).toBeDefined()
      expect(job1!.opts.deduplication!.id).toBe('myId1:myValue1')

      const job2 = await queueManager.getQueue('queue_valid').getJob(jobIds[1])
      expect(job2).toBeDefined()
      expect(job2!.opts.deduplication!.id).toBe('myId2:myValue2')
    })
  })
})
