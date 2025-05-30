import type { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import { QUEUE_IDS_KEY, RETENTION_QUEUE_IDS_IN_DAYS } from '../constants.ts'
import { daysToMilliseconds } from '../utils.ts'
import { backgroundJobProcessorGetActiveQueueIds } from './backgroundJobProcessorGetActiveQueueIds.ts'

describe('backgroundJobProcessorGetActiveQueueIds', () => {
  let factory: TestDependencyFactory
  let redis: Redis

  beforeAll(() => {
    factory = new TestDependencyFactory()
    redis = factory.startRedis()
  })

  beforeEach(async () => {
    await factory.clearRedis()
  })

  afterAll(async () => {
    await factory.dispose()
  })

  it.each([[true], [false]])(
    'returns not expired elements on the set using redis client=%s',
    async (useRedisClient) => {
      const retentionMs = daysToMilliseconds(RETENTION_QUEUE_IDS_IN_DAYS)

      await redis.zadd(QUEUE_IDS_KEY, Date.now() - retentionMs, 'expired')
      await redis.zadd(QUEUE_IDS_KEY, Date.now(), 'queue2')
      await redis.zadd(QUEUE_IDS_KEY, Date.now() - retentionMs + 100, 'queue1')

      const queues = await backgroundJobProcessorGetActiveQueueIds(
        useRedisClient ? redis : factory.getRedisConfig(),
      )
      expect(queues).toEqual(['queue1', 'queue2'])
    },
  )
})
