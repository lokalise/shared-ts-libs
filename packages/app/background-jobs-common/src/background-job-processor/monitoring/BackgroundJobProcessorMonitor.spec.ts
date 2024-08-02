import { afterAll, beforeAll, beforeEach, describe } from 'vitest'

import type Redis from 'ioredis'
import { DependencyMocks } from '../../../test/dependencyMocks'
import type { BackgroundJobProcessorDependencies } from '../processors/types'
import { BackgroundJobProcessorMonitor } from './BackgroundJobProcessorMonitor'

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
    // TODO
  })

  describe('unregisterQueue', () => {
    // TODO
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
