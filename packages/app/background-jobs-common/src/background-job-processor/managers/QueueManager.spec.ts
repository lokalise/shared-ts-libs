import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import type Redis from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { DependencyMocks } from '../../../test/dependencyMocks'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import { FakeQueueManager } from './FakeQueueManager'
import type { QueueConfiguration } from './types'

const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

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

const SupportedQueues = [
  {
    queueId: 'queue1',
    jobPayloadSchema: jobPayloadSchema.strict(),
  },
  {
    queueId: 'queue2',
    jobPayloadSchema: jobPayloadSchema2,
  },
] as const satisfies QueueConfiguration[]

describe('QueueManager', () => {
  let mocks: DependencyMocks
  let redis: Redis
  let redisConfig: RedisConfig

  beforeEach(async () => {
    mocks = new DependencyMocks()
    redis = mocks.startRedis()
    redisConfig = mocks.getRedisConfig()

    await redis?.flushall('SYNC')
  })

  afterEach(async () => {
    await mocks.dispose()
  })

  describe('start', () => {
    beforeEach(async () => {
      await redis?.del(QUEUE_IDS_KEY)
    })

    it('Multiple start calls (sequential or concurrent) not produce errors', async () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
      })

      // sequential start calls
      await expect(queueManager.start()).resolves.not.toThrowError()
      await expect(queueManager.start()).resolves.not.toThrowError()
      await queueManager.dispose()

      // concurrent start calls
      await expect(
        Promise.all([queueManager.start(), queueManager.start()]),
      ).resolves.not.toThrowError()

      await queueManager.dispose()
    })

    it('Starts multiple queues', async () => {
      const queueManager = new FakeQueueManager(SupportedQueues, {
        redisConfig,
      })
      await queueManager.start()

      expect(queueManager.getQueue('queue1')).toBeDefined()
      expect(queueManager.getQueue('queue2')).toBeDefined()

      await queueManager.dispose()
    })

    it('Starts only provided queues', async () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
      })
      await queueManager.start(['queue1'])

      expect(queueManager.getQueue('queue1')).toBeDefined()
      expect(() => queueManager.getQueue('queue2')).toThrowError(
        /queue .* was not instantiated yet, please run "start\(\)"/,
      )

      await queueManager.dispose()
    })

    it('Throw error if try to schedule job without starting queueManager and lazy init disabled', async () => {
      const queueManager = new FakeQueueManager(SupportedQueues, {
        redisConfig,
      })

      await expect(
        queueManager.schedule('queue2', {
          id: 'id',
          value: 'test',
          value2: 'test',
          metadata: { correlationId: 'correlation_id' },
        }),
      ).rejects.toThrowError(/QueueManager not started, please call `start` or enable lazy init/)
    })

    it('Throw error if try to schedule with invalid payload', async () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
      })

      await expect(
        queueManager.schedule('queue1', {
          value: 'test',
          // @ts-expect-error Should only expect fields from queue1 schema
          value2: 'test',
          metadata: { correlationId: 'correlation_id' },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `
        [ZodError: [
          {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": [
              "id"
            ],
            "message": "Required"
          },
          {
            "code": "unrecognized_keys",
            "keys": [
              "value2"
            ],
            "path": [],
            "message": "Unrecognized key(s) in object: 'value2'"
          }
        ]]
      `,
      )

      await expect(
        queueManager.schedule(
          'queue1',
          // @ts-ignore Should expect mandatory fields from queue1 schema
          {
            value: 'test',
            metadata: { correlationId: 'correlation_id' },
          },
        ),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": [
              "id"
            ],
            "message": "Required"
          }
        ]]
      `)
    })

    it('Throw error if try to scheduleBulk with invalid payload', async () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
      })

      await expect(
        queueManager.scheduleBulk('queue1', [
          {
            value: 'test',
            // @ts-expect-error Should only expect fields from queue1 schema
            value2: 'test',
            metadata: { correlationId: 'correlation_id' },
          },
        ]),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `
        [ZodError: [
          {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": [
              "id"
            ],
            "message": "Required"
          },
          {
            "code": "unrecognized_keys",
            "keys": [
              "value2"
            ],
            "path": [],
            "message": "Unrecognized key(s) in object: 'value2'"
          }
        ]]
      `,
      )

      await expect(
        queueManager.scheduleBulk('queue1', [
          // @ts-ignore Should expect mandatory fields from queue1 schema
          {
            value: 'test',
            metadata: { correlationId: 'correlation_id' },
          },
        ]),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": [
              "id"
            ],
            "message": "Required"
          }
        ]]
      `)
    })

    it('Lazy loading on schedule', async () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
        lazyInitEnabled: true,
      })

      const jobId = await queueManager.schedule('queue1', {
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })
      const spyResult = await queueManager.spy.waitForJobWithId(jobId, 'scheduled')

      expect(spyResult.data).toMatchObject({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })
      await queueManager.dispose()
    })

    it('Lazy loading on scheduleBulk', async () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig: mocks.getRedisConfig(),
        lazyInitEnabled: true,
      })

      const jobIds = await queueManager.scheduleBulk('queue1', [
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
        {
          id: 'test_id2',
          value: 'test2',
          metadata: { correlationId: 'correlation_id2' },
        },
      ])
      const spy1stJobResult = await queueManager.spy.waitForJobWithId(jobIds[0], 'scheduled')
      const spy3rdJobResult = await queueManager.spy.waitForJobWithId(jobIds[1], 'scheduled')

      expect(spy1stJobResult.data).toMatchObject({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })
      expect(spy3rdJobResult.data).toMatchObject({
        id: 'test_id2',
        value: 'test2',
        metadata: { correlationId: 'correlation_id2' },
      })
      await queueManager.dispose()
    })
  })

  describe('getJobsInStates', () => {
    let queueManager: FakeQueueManager<typeof SupportedQueues>

    beforeEach(async () => {
      queueManager = new FakeQueueManager(SupportedQueues, {
        redisConfig,
      })
      await queueManager.start()
    })

    afterEach(async () => {
      await queueManager.dispose()
    })

    it('empty states should throw error', async () => {
      await expect(queueManager.getJobsInQueue('queue1', [])).rejects.toThrowError(
        'states must not be empty',
      )
    })

    it('start bigger than end should throw error', async () => {
      await expect(queueManager.getJobsInQueue('queue1', ['active'], 2, 1)).rejects.toThrowError(
        'start must be less than or equal to end',
      )
    })

    it('returns jobs in the given states', async () => {
      // Given - When
      const jobIds = await queueManager.scheduleBulk(
        'queue1',
        [
          {
            id: generateMonotonicUuid(),
            value: 'test1',
            metadata: { correlationId: generateMonotonicUuid() },
          },
          {
            id: generateMonotonicUuid(),
            value: 'test2',
            metadata: { correlationId: generateMonotonicUuid() },
          },
          {
            id: generateMonotonicUuid(),
            value: 'test3',
            metadata: { correlationId: generateMonotonicUuid() },
          },
        ],
        { delay: 1000 },
      )

      // Then
      const jobs1 = await queueManager.getJobsInQueue('queue1', ['delayed'])
      expect(jobs1).toMatchObject({
        jobs: expect.arrayContaining(jobIds.map((id) => expect.objectContaining({ id }))),
        hasMore: false,
      })
      expect(jobs1.jobs.map((e) => e.id)).toEqual(jobIds) // order is respected - by default asc

      const jobs2 = await queueManager.getJobsInQueue('queue1', ['delayed'], 0, 0)
      expect(jobs2).toMatchObject({
        jobs: expect.arrayContaining([expect.objectContaining({ id: jobIds[0] })]),
        hasMore: true,
      })

      const jobs3 = await queueManager.getJobsInQueue('queue1', ['delayed'], 0, 1, false)
      expect(jobs3).toMatchObject({
        jobs: expect.arrayContaining([
          expect.objectContaining({ id: jobIds[2] }),
          expect.objectContaining({ id: jobIds[1] }),
        ]),
        hasMore: true,
      })

      const jobs4 = await queueManager.getJobsInQueue('queue1', ['delayed'], 1, 2)
      expect(jobs4).toMatchObject({
        jobs: expect.arrayContaining([
          expect.objectContaining({ id: jobIds[1] }),
          expect.objectContaining({ id: jobIds[2] }),
        ]),
        hasMore: false,
      })
    })
  })

  describe('getJobCount', () => {
    it('job count works as expected', async () => {
      // Given
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
      })
      await queueManager.start()
      expect(await queueManager.getJobCount('queue1')).toBe(0)

      // When
      await queueManager.schedule('queue1', {
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })

      // Then
      expect(await queueManager.getJobCount('queue1')).toBe(1)

      await queueManager.dispose()
    })
  })

  describe('spy', () => {
    it('returns the spy instance when in test mode', () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
        isTest: true,
      })
      expect(queueManager.spy).toBeInstanceOf(BackgroundJobProcessorSpy)
    })

    it('throws an error when spy is accessed and not in test mode', () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
        isTest: false,
      })
      expect(() => queueManager.spy).toThrowError(
        'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
      )
    })
  })

  describe('dispose', () => {
    it('does nothing if not started', async () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
      })
      await expect(queueManager.dispose()).resolves.not.toThrowError()
    })

    it('closes all queues if started', async () => {
      const queueManager = new FakeQueueManager(SupportedQueues, {
        redisConfig,
      })
      await queueManager.start()
      const isPaused = await queueManager.getQueue('queue1').isPaused()
      expect(isPaused).toBe(false)
      await expect(queueManager.dispose()).resolves.not.toThrowError()
      await expect(queueManager.getQueue('queue1').isPaused()).rejects.toThrowError(
        'Connection is closed.',
      )
    })

    it('handles errors during queue closing gracefully', async () => {
      const queueManager = new FakeQueueManager([SupportedQueues[0]], {
        redisConfig,
      })
      await queueManager.start()
      // @ts-ignore
      vi.spyOn(queueManager.getQueue('queue1'), 'close').mockRejectedValue(new Error('close error'))
      await expect(queueManager.dispose()).resolves.not.toThrowError()
    })
  })
})
