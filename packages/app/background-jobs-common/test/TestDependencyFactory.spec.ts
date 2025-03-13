import type { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TestDependencyFactory } from './TestDependencyFactory.js'

describe('TestDependencyFactory', () => {
  let factory: TestDependencyFactory
  let redis: Redis

  beforeAll(() => {
    factory = new TestDependencyFactory()
    redis = factory.startRedis()
  })
  afterAll(async () => {
    await factory.dispose()
  })

  it('should start redis server', async () => {
    expect(redis).toBeDefined()
    expect(await redis.ping()).toBe('PONG')
  })
})
