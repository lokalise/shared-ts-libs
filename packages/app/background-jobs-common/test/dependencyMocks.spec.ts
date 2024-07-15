import type { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DependencyMocks } from './dependencyMocks'

describe('DependencyMocks', () => {
  let mocks: DependencyMocks
  let redis: Redis
  beforeAll(() => {
    mocks = new DependencyMocks()
    // @ts-ignore redis is not undefined
    redis = mocks.startRedis()
  })
  afterAll(async () => {
    await mocks.dispose()
  })

  it('should start redis server', async () => {
    expect(redis).toBeDefined()
    expect(await redis.ping()).toBe('PONG')
  })
})
