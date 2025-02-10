import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory'
import type { JobsPaginatedResponse } from '../processors/types'
import { BackgroundJobProcessorSpy } from '../spy/BackgroundJobProcessorSpy'
import type { BackgroundJobProcessorSpyInterface } from '../spy/types'
import { FakeQueueManager } from './FakeQueueManager'
import type { QueueConfiguration } from './types'

const supportedQueues = [
  {
    queueId: 'queue1',
    jobPayloadSchema: z
      .object({
        id: z.string(),
        value: z.string(),
        metadata: z.object({
          correlationId: z.string(),
        }),
      })
      .strict(),
  },
  {
    queueId: 'queue2',
    jobPayloadSchema: z.object({
      id: z.string(),
      value2: z.string(),
      metadata: z.object({
        correlationId: z.string(),
      }),
    }),
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('QueueManager', () => {
  let factory: TestDependencyFactory
  let redisConfig: RedisConfig

  let queueManager: FakeQueueManager<SupportedQueues>

  beforeEach(async () => {
    factory = new TestDependencyFactory()
    redisConfig = factory.getRedisConfig()
    const deps = factory.createNew(supportedQueues)
    queueManager = deps.queueManager

    await factory.clearRedis()
  })

  afterEach(async () => {
    await factory.dispose()
  })

  describe('start', () => {
    it('Multiple start calls (sequential or concurrent) not produce errors', async () => {
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
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
      const queueManager = new FakeQueueManager(supportedQueues, {
        redisConfig,
      })
      await queueManager.start()

      expect(queueManager.getQueue('queue1')).toBeDefined()
      expect(queueManager.getQueue('queue2')).toBeDefined()

      await queueManager.dispose()
    })

    it('Starts only provided queues', async () => {
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
        redisConfig,
      })
      await queueManager.start(['queue1'])

      expect(queueManager.getQueue('queue1')).toBeDefined()
      // @ts-expect-error - queue2 is not a valid queue id
      expect(() => queueManager.getQueue('queue2')).toThrowError(
        /queue .* was not instantiated yet, please run "start\(\)"/,
      )

      await queueManager.dispose()
    })

    it('should ignore if try to start a non-defined queue', async () => {
      const queueManager = new FakeQueueManager(supportedQueues, {
        redisConfig,
      })

      // @ts-expect-error - queue3 is not a valid queue id
      expect(() => queueManager.getQueue('queue3')).toThrowError(
        /queue .* was not instantiated yet, please run "start\(\)"/,
      )
      await queueManager.start(['queue3'])
      // @ts-expect-error - queue3 is not a valid queue id
      expect(() => queueManager.getQueue('queue3')).toThrowError(
        /queue .* was not instantiated yet, please run "start\(\)"/,
      )

      await queueManager.dispose()
    })

    it('throw error if try to schedule job without starting queueManager and lazy init disabled', async () => {
      const queueManager = new FakeQueueManager(supportedQueues, {
        redisConfig,
        lazyInitEnabled: false,
      })

      await expect(
        queueManager.schedule('queue2', {
          id: 'id',
          value2: 'test',
          metadata: { correlationId: 'correlation_id' },
        }),
      ).rejects.toThrowError(/QueueManager not started, please call `start` or enable lazy init/)
    })

    it('lazy init on schedule', async () => {
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
        redisConfig,
        lazyInitEnabled: true,
      })

      const jobId = await queueManager.schedule('queue1', {
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })
      const spyResult = await queueManager.getSpy('queue1').waitForJobWithId(jobId, 'scheduled')

      expect(spyResult.data).toMatchObject({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })
      await queueManager.dispose()
    })

    it('lazy init on scheduleBulk', async () => {
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
        redisConfig: factory.getRedisConfig(),
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
      const spy1stJobResult = await queueManager
        .getSpy('queue1')
        .waitForJobWithId(jobIds[0], 'scheduled')
      const spy3rdJobResult = await queueManager
        .getSpy('queue1')
        .waitForJob((data) => data.value === 'test2', 'scheduled')

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

  describe('schedule', () => {
    it('throw error if try to schedule with invalid payload', async () => {
      await expect(
        queueManager.schedule('queue1', {
          value: 'test',
          // @ts-expect-error Should only expect fields from queue1 schema
          notPresent: 'test',
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
              "notPresent"
            ],
            "path": [],
            "message": "Unrecognized key(s) in object: 'notPresent'"
          }
        ]]
      `,
      )

      await expect(
        queueManager.schedule(
          'queue1',
          // IDE from some reason complains about expect-error, we will look into it independently
          // @ts-expect-error > Should expect mandatory fields from queue1 schema
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

    it('throw error if try to scheduleBulk with invalid payload', async () => {
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
          // IDE from some reason complains about expect-error, we will look into it independently
          // @ts-expect-error Should expect mandatory fields from queue1 schema
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
  })

  describe('getJobsInStates', () => {
    let queueManager: FakeQueueManager<typeof supportedQueues>

    beforeEach(async () => {
      queueManager = new FakeQueueManager(supportedQueues, {
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

    it('type inferring works', () => {
      type returnType1 = ReturnType<typeof queueManager.getJobsInQueue<'queue1'>>
      type returnType2 = ReturnType<typeof queueManager.getJobsInQueue<'queue2'>>

      const schema1 = supportedQueues[0].jobPayloadSchema
      type schemaType1 = z.infer<typeof schema1>
      expectTypeOf<returnType1>().toEqualTypeOf<
        Promise<JobsPaginatedResponse<schemaType1, unknown>>
      >()

      const schema2 = supportedQueues[1].jobPayloadSchema
      type schemaType2 = z.infer<typeof schema2>
      expectTypeOf<returnType2>().toEqualTypeOf<
        Promise<JobsPaginatedResponse<schemaType2, unknown>>
      >()
    })
  })

  describe('getJobCount', () => {
    it('job count works as expected', async () => {
      // Given
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
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
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
        redisConfig,
        isTest: true,
      })
      expect(queueManager.getSpy('queue1')).toBeInstanceOf(BackgroundJobProcessorSpy)
    })

    it('throws an error when spy is accessed and not in test mode', () => {
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
        redisConfig,
        isTest: false,
      })
      expect(() => queueManager.getSpy('queue1')).toThrowError(
        'spy was not instantiated, it is only available on test mode. Please use `config.isTest` to enable it.',
      )
    })

    it('should infer type of spy', () => {
      type returnType1 = ReturnType<typeof queueManager.getSpy<'queue1'>>
      type returnType2 = ReturnType<typeof queueManager.getSpy<'queue2'>>

      const schema1 = supportedQueues[0].jobPayloadSchema
      type schemaType1 = z.infer<typeof schema1>
      expectTypeOf<returnType1>().toEqualTypeOf<
        BackgroundJobProcessorSpyInterface<schemaType1, undefined>
      >()

      const schema2 = supportedQueues[1].jobPayloadSchema
      type schemaType2 = z.infer<typeof schema2>
      expectTypeOf<returnType2>().toEqualTypeOf<
        BackgroundJobProcessorSpyInterface<schemaType2, undefined>
      >()
    })
  })

  describe('dispose', () => {
    it('does nothing if not started', async () => {
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
        redisConfig,
      })
      await expect(queueManager.dispose()).resolves.not.toThrowError()
    })

    it('closes all queues if started', async () => {
      const queueManager = new FakeQueueManager(supportedQueues, {
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
      const queueManager = new FakeQueueManager([supportedQueues[0]], {
        redisConfig,
      })
      await queueManager.start()
      // @ts-ignore
      vi.spyOn(queueManager.getQueue('queue1'), 'close').mockRejectedValue(new Error('close error'))
      await expect(queueManager.dispose()).resolves.not.toThrowError()
    })
  })
})
