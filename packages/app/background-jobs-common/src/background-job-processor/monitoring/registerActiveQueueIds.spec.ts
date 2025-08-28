import { setTimeout } from 'node:timers/promises'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, expect } from 'vitest'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import { QUEUE_IDS_KEY } from '../constants.ts'
import { registerActiveQueueIds } from './registerActiveQueueIds.ts'

describe('registerActiveQueueIds', () => {
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

  it('should not fail if queues array is empty', async () => {
    await registerActiveQueueIds(factory.getRedisConfig(), [])

    const result = await redis.zrange('queueIds', 0, -1)
    expect(result).toEqual([])
  })

  it('should register single queue', async () => {
    await registerActiveQueueIds(factory.getRedisConfig(), [{ queueId: 'queue1' }])

    const today = new Date()
    const [queueId, score] = await redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
    expect(queueId).toStrictEqual('queue1')

    // Comparing timestamps in seconds
    const todaySeconds = Math.floor(today.getTime() / 1000)
    const scoreSeconds = Math.floor(new Date(Number.parseInt(score!, 10)).getTime() / 1000)
    // max difference 1 to handle edge case of 0.1 - 1.0
    expect(scoreSeconds - todaySeconds).lessThanOrEqual(1)
  })

  it('should update score', async () => {
    const queues = [{ queueId: 'queue1' }]

    await registerActiveQueueIds(factory.getRedisConfig(), queues)
    const [queueId, score] = await redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
    expect(queueId).toStrictEqual('queue1')

    await setTimeout(10)

    await registerActiveQueueIds(factory.getRedisConfig(), queues)
    const [_, scoreUpdated] = await redis.zrange(QUEUE_IDS_KEY, 0, -1, 'WITHSCORES')
    expect(queueId).toStrictEqual('queue1')

    const initialScoreDate = new Date(Number.parseInt(score!, 10))
    const updatedScoreDate = new Date(Number.parseInt(scoreUpdated!, 10))

    expect(initialScoreDate).not.toEqual(updatedScoreDate)
    expect(initialScoreDate.getTime()).toBeLessThan(updatedScoreDate.getTime())
  })

  it('should register single queue resolving id', async () => {
    await registerActiveQueueIds(factory.getRedisConfig(), [
      { queueId: 'queue1', bullDashboardGrouping: ['group'] },
    ])

    const result = await redis.zrange(QUEUE_IDS_KEY, 0, -1)
    expect(result).toEqual(['group.queue1'])
  })

  it('should register multiple queues', async () => {
    await registerActiveQueueIds(factory.getRedisConfig(), [
      { queueId: 'queue1', bullDashboardGrouping: ['group'] },
      { queueId: 'queue2' },
    ])

    const result = await redis.zrange(QUEUE_IDS_KEY, 0, -1)
    expect(result).toEqual(['group.queue1', 'queue2'])
  })
})
