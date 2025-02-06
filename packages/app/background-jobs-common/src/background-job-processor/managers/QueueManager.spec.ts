import { randomUUID } from 'node:crypto'
import { generateMonotonicUuid } from '@lokalise/id-utils'
import type Redis from 'ioredis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DependencyMocks } from '../../../test/dependencyMocks.js'
import { FakeQueueManager } from './FakeQueueManager.js'
import type { QueueConfiguration } from './QueueManager.js'

const QUEUE_IDS_KEY = 'background-jobs-common:background-job:queues'

describe('QueueManager', () => {
  let mocks: DependencyMocks
  let redis: Redis
  let queue1Configuration: QueueConfiguration
  let queue2Configuration: QueueConfiguration

  beforeEach(async () => {
    mocks = new DependencyMocks()
    redis = mocks.startRedis()

    queue1Configuration = {
      queueId: randomUUID(),
      redisConfig: mocks.getRedisConfig(),
    }
    queue2Configuration = {
      queueId: randomUUID(),
      redisConfig: mocks.getRedisConfig(),
    }

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
      const queueManager = new FakeQueueManager([queue1Configuration])

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
      const queueManager = new FakeQueueManager([queue1Configuration, queue2Configuration])
      await queueManager.start()

      expect(queueManager.getQueue(queue1Configuration.queueId)).toBeDefined()
      expect(queueManager.getQueue(queue2Configuration.queueId)).toBeDefined()

      await queueManager.dispose()
    })

    it('Starts only provided queues', async () => {
      const queueManager = new FakeQueueManager([queue1Configuration, queue2Configuration])
      await queueManager.start([queue1Configuration.queueId])

      expect(queueManager.getQueue(queue1Configuration.queueId)).toBeDefined()
      expect(() => queueManager.getQueue(queue2Configuration.queueId)).toThrowError(
        /queue .* was not instantiated yet, please run "start\(\)"/,
      )

      await queueManager.dispose()
    })

    it('Throw error if try to schedule job without starting queueManager and lazy init disabled', async () => {
      const queueManager = new FakeQueueManager([queue1Configuration])

      await expect(
        queueManager.schedule(queue1Configuration.queueId, {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        }),
      ).rejects.toThrowError(/QueueManager not started, please call `start` or enable lazy init/)
    })

    it('Lazy loading on schedule', async () => {
      const queueManager = new FakeQueueManager([queue1Configuration], { lazyInitEnabled: true })

      const jobId = await queueManager.schedule(queue1Configuration.queueId, {
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

    it('Does not lazy loads on undefined queues', async () => {
      const queueManager = new FakeQueueManager([queue1Configuration], { lazyInitEnabled: true })

      await expect(
        queueManager.schedule(queue2Configuration.queueId, {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        }),
      ).rejects.toThrowError(/queue .* was not instantiated yet, please run "start\(\)"/)

      await queueManager.dispose()
    })

    it('Lazy loading on scheduleBulk', async () => {
      const queueManager = new FakeQueueManager([queue1Configuration], { lazyInitEnabled: true })

      const jobIds = await queueManager.scheduleBulk(queue1Configuration.queueId, [
        {
          id: 'test_id',
          value: 'test',
          metadata: { correlationId: 'correlation_id' },
        },
      ])
      const spyResult = await queueManager.spy.waitForJobWithId(jobIds[0], 'scheduled')

      expect(spyResult.data).toMatchObject({
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })
      await queueManager.dispose()
    })
  })

  describe('getJobsInStates', () => {
    let queueManager: FakeQueueManager<QueueConfiguration[]>

    beforeEach(async () => {
      queueManager = new FakeQueueManager([queue1Configuration])
      await queueManager.start()
    })

    afterEach(async () => {
      await queueManager.dispose()
    })

    it('empty states should throw error', async () => {
      await expect(
        queueManager.getJobsInQueue(queue1Configuration.queueId, []),
      ).rejects.toThrowError('states must not be empty')
    })

    it('start bigger than end should throw error', async () => {
      await expect(
        queueManager.getJobsInQueue(queue1Configuration.queueId, ['active'], 2, 1),
      ).rejects.toThrowError('start must be less than or equal to end')
    })

    it('returns jobs in the given states', async () => {
      // Given - When
      const jobIds = await queueManager.scheduleBulk(
        queue1Configuration.queueId,
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
      const jobs1 = await queueManager.getJobsInQueue(queue1Configuration.queueId, ['delayed'])
      expect(jobs1).toMatchObject({
        jobs: expect.arrayContaining(jobIds.map((id) => expect.objectContaining({ id }))),
        hasMore: false,
      })
      expect(jobs1.jobs.map((e) => e.id)).toEqual(jobIds) // order is respected - by default asc

      const jobs2 = await queueManager.getJobsInQueue(
        queue1Configuration.queueId,
        ['delayed'],
        0,
        0,
      )
      expect(jobs2).toMatchObject({
        jobs: expect.arrayContaining([expect.objectContaining({ id: jobIds[0] })]),
        hasMore: true,
      })

      const jobs3 = await queueManager.getJobsInQueue(
        queue1Configuration.queueId,
        ['delayed'],
        0,
        1,
        false,
      )
      expect(jobs3).toMatchObject({
        jobs: expect.arrayContaining([
          expect.objectContaining({ id: jobIds[2] }),
          expect.objectContaining({ id: jobIds[1] }),
        ]),
        hasMore: true,
      })

      const jobs4 = await queueManager.getJobsInQueue(
        queue1Configuration.queueId,
        ['delayed'],
        1,
        2,
      )
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
      const queueManager = new FakeQueueManager([queue1Configuration])
      await queueManager.start()
      expect(await queueManager.getJobCount(queue1Configuration.queueId)).toBe(0)

      // When
      await queueManager.schedule(queue1Configuration.queueId, {
        id: 'test_id',
        value: 'test',
        metadata: { correlationId: 'correlation_id' },
      })

      // Then
      expect(await queueManager.getJobCount(queue1Configuration.queueId)).toBe(1)

      await queueManager.dispose()
    })
  })
})
