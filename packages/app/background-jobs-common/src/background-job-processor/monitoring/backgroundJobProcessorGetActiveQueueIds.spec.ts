import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type Redis from 'ioredis'
import { DependencyMocks } from '../../../test/dependencyMocks'
import { QUEUE_IDS_KEY, RETENTION_QUEUE_IDS_IN_DAYS } from '../constants'
import { daysToMilliseconds } from '../utils'
import { backgroundJobProcessorGetActiveQueueIds } from './backgroundJobProcessorGetActiveQueueIds'

describe('backgroundJobProcessorGetActiveQueueIds', () => {
  let mocks: DependencyMocks
  let redis: Redis

  beforeAll(() => {
    mocks = new DependencyMocks()
    redis = mocks.startRedis()
  })

  beforeEach(async () => {
    await mocks.clearRedis()
  })

  afterAll(async () => {
    await mocks.dispose()
  })

  it.each([[true], [false]])(
    'returns not expired elements on the set using redis client=%s',
    async (useRedisClient) => {
      const retentionMs = daysToMilliseconds(RETENTION_QUEUE_IDS_IN_DAYS)

      await redis.zadd(QUEUE_IDS_KEY, Date.now() - retentionMs, 'expired')
      await redis.zadd(QUEUE_IDS_KEY, Date.now(), 'queue2')
      await redis.zadd(QUEUE_IDS_KEY, Date.now() - retentionMs + 100, 'queue1')

      const queues = await backgroundJobProcessorGetActiveQueueIds(
        useRedisClient ? redis : mocks.getRedisConfig(),
      )
      expect(queues).toEqual(['queue1', 'queue2'])
    },
  )
})
