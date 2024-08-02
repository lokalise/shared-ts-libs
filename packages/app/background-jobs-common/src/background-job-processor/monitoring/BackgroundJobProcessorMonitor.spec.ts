import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type Redis from 'ioredis'
import { DependencyMocks } from '../../../test/dependencyMocks'
import { QUEUE_IDS_KEY } from '../constants'
import { FakeBackgroundJobProcessor } from '../processors/FakeBackgroundJobProcessor'
import type { BackgroundJobProcessorDependencies } from '../processors/types'
import { BackgroundJobProcessorMonitor } from './BackgroundJobProcessorMonitor'
import { backgroundJobProcessorGetActiveQueueIds } from './backgroundJobProcessorGetActiveQueueIds'

describe('BackgroundJobProcessorMonitor', () => {
  let mocks: DependencyMocks
  let deps: BackgroundJobProcessorDependencies<any>
  let redis: Redis
  let monitor: BackgroundJobProcessorMonitor

  beforeAll(() => {
    mocks = new DependencyMocks()
    deps = mocks.create()
    redis = mocks.startRedis()
    monitor = new BackgroundJobProcessorMonitor(
      deps,
      {
        queueId: 'test-queue',
        ownerName: 'test-owner',
        redisConfig: mocks.getRedisConfig(),
      },
      'BackgroundJobProcessorMonitor tests',
    )
  })

  beforeEach(async () => {
    await redis?.flushall('SYNC')
  })

  afterAll(async () => {
    redis.disconnect()
    await mocks.dispose()
  })

  describe('registerQueue', () => {
    it('throws an error if we try to register same queue twice', async () => {
      const queueId = 'test-queue'
      const monitor1 = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId,
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'registerQueue tests',
      )

      await monitor1.registerQueue()
      await expect(
        new BackgroundJobProcessorMonitor(
          deps,
          {
            queueId,
            ownerName: 'test-owner',
            redisConfig: mocks.getRedisConfig(),
          },
          'registerQueue tests',
        ).registerQueue(),
      ).rejects.toThrow(/Queue id "test-queue" is not unique/)

      await monitor1.unregisterQueue()
    })

    it('queue id is stored/updated on redis with current timestamp', async () => {
      const monitor = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId: 'test-queue',
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'registerQueue tests',
      )
      await monitor.registerQueue()

      const today = new Date()
      const [, score] = await redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
      const queueIds = await backgroundJobProcessorGetActiveQueueIds(mocks.getRedisConfig())
      expect(queueIds).toStrictEqual(['test-queue'])

      // Comparing timestamps in seconds
      const todaySeconds = Math.floor(today.getTime() / 1000)
      const scoreSeconds = Math.floor(new Date(Number.parseInt(score)).getTime() / 1000)
      // max difference 1 to handle edge case of 0.1 - 1.0
      expect(scoreSeconds - todaySeconds).lessThanOrEqual(1)

      // unregistering to avoid error (see prev test)
      monitor.unregisterQueue()
      await monitor.registerQueue()

      const [, scoreAfterRestart] = await redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
      const queueIdsAfterRestart = await backgroundJobProcessorGetActiveQueueIds(
        mocks.getRedisConfig(),
      )
      expect(queueIdsAfterRestart).toStrictEqual(['test-queue'])
      expect(new Date(Number.parseInt(score))).not.toEqual(
        new Date(Number.parseInt(scoreAfterRestart)),
      )

      monitor.unregisterQueue()
    })
  })

  describe('unregisterQueue', () => {
    it('unregister remove in memory queue id but no on redis', async () => {
      const monitor = new BackgroundJobProcessorMonitor(
        deps,
        {
          queueId: 'test-queue',
          ownerName: 'test-owner',
          redisConfig: mocks.getRedisConfig(),
        },
        'registerQueue tests',
      )

      await monitor.registerQueue()
      monitor.unregisterQueue()
      await monitor.registerQueue() // no error on register after unregister
      monitor.unregisterQueue()

      const queueIdsAfterUnregister = await backgroundJobProcessorGetActiveQueueIds(
        mocks.getRedisConfig(),
      )
      expect(queueIdsAfterUnregister).toStrictEqual(['test-queue'])
    })
  })

  describe('getRequestContext', () => {
    // TODO
  })

  describe('logJobStarted', () => {
    // TODO
  })

  describe('logJobCompleted', () => {
    // TODO
  })
})
