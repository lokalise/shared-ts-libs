import { generateMonotonicUuid } from '@lokalise/id-utils'
import type { RedisConfig } from '@lokalise/node-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import { CommonBullmqFactoryNew } from '../factories/index.ts'
import { type LokaliseQueueConfiguration, LokaliseQueueManager } from './LokaliseQueueManager.ts'

const supportedQueues = [
  {
    queueId: 'email-queue',
    moduleId: 'notifications',
    jobPayloadSchema: z.object({
      id: z.string(),
      email: z.string(),
      metadata: z.object({
        correlationId: z.string(),
      }),
    }),
  },
  {
    queueId: 'sms-queue',
    moduleId: 'notifications',
    jobPayloadSchema: z.object({
      id: z.string(),
      phone: z.string(),
      metadata: z.object({
        correlationId: z.string(),
      }),
    }),
  },
] as const satisfies LokaliseQueueConfiguration[]

type SupportedQueues = typeof supportedQueues

/**
 * Note that these tests focus on the LokaliseQueueManager extended functionality only
 * and do not cover the base QueueManager functionality, which is tested separately.
 */
describe('LokaliseQueueManager', () => {
  let factory: TestDependencyFactory
  let redisConfig: RedisConfig
  let queueManager: LokaliseQueueManager<SupportedQueues>

  beforeAll(() => {
    factory = new TestDependencyFactory()
    redisConfig = factory.getRedisConfig()
  })

  beforeEach(async () => {
    await factory.clearRedis()
  })

  afterEach(async () => {
    await queueManager?.dispose()
    await factory.clearRedis()
  })

  afterAll(async () => {
    await factory.dispose()
  })

  it('should automatically build bullDashboardGrouping from serviceId and moduleId', async () => {
    queueManager = new LokaliseQueueManager(
      'test-service',
      new CommonBullmqFactoryNew(),
      supportedQueues,
      {
        isTest: true,
        redisConfig,
      },
    )

    await queueManager.start()

    const queue1Config = queueManager.getQueueConfig('email-queue')
    const queue2Config = queueManager.getQueueConfig('sms-queue')

    expect(queue1Config).toMatchObject({ bullDashboardGrouping: ['test-service', 'notifications'] })
    expect(queue2Config).toMatchObject({ bullDashboardGrouping: ['test-service', 'notifications'] })
  })

  it('should set lazyInitEnabled to false in test mode and true in production', async () => {
    // Test mode: lazyInitEnabled should be false
    const testQueueManager = new LokaliseQueueManager(
      'test-service',
      new CommonBullmqFactoryNew(),
      supportedQueues,
      {
        isTest: true,
        redisConfig,
      },
    )

    expect(testQueueManager.config.lazyInitEnabled).toBe(false)
    await testQueueManager.dispose()

    // Production mode: lazyInitEnabled should be true
    const prodQueueManager = new LokaliseQueueManager(
      'test-service',
      new CommonBullmqFactoryNew(),
      supportedQueues,
      {
        isTest: false,
        redisConfig,
      },
    )

    expect(prodQueueManager.config.lazyInitEnabled).toBe(true)
    await prodQueueManager.dispose()
  })

  it('should schedule jobs and work like base QueueManager', async () => {
    queueManager = new LokaliseQueueManager(
      'test-service',
      new CommonBullmqFactoryNew(),
      supportedQueues,
      {
        isTest: true,
        redisConfig,
      },
    )

    await queueManager.start()

    const jobId = await queueManager.schedule('email-queue', {
      id: 'test-id',
      email: 'test@example.com',
      metadata: { correlationId: generateMonotonicUuid() },
    })
    expect(jobId).toBeDefined()

    const jobCount = await queueManager.getJobCount('email-queue')
    expect(jobCount).toBe(1)
  })
})
