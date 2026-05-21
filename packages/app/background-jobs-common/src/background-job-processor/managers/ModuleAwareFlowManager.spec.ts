import type { RedisConfig } from '@lokalise/node-core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import { CommonBullmqFactoryNew } from '../factories/index.ts'
import { ModuleAwareFlowManager, type ModuleAwareQueueConfiguration } from './index.ts'

const supportedQueues = [
  {
    queueId: 'email-queue',
    moduleId: 'emails',
    jobPayloadSchema: z.object({
      id: z.string(),
      email: z.string(),
      metadata: z.object({ correlationId: z.string() }),
    }),
  },
  {
    queueId: 'sms-queue',
    moduleId: 'phone',
    jobPayloadSchema: z.object({
      id: z.string(),
      phone: z.string(),
      metadata: z.object({ correlationId: z.string() }),
    }),
  },
] as const satisfies ModuleAwareQueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('ModuleAwareFlowManager', () => {
  let factory: TestDependencyFactory
  let redisConfig: RedisConfig
  let flowManager: ModuleAwareFlowManager<SupportedQueues>

  beforeAll(() => {
    factory = new TestDependencyFactory()
    redisConfig = factory.getRedisConfig()
  })

  beforeEach(async () => {
    await factory.clearRedis()
  })

  afterEach(async () => {
    await flowManager?.dispose()
    await factory.clearRedis()
  })

  afterAll(async () => {
    await factory.dispose()
  })

  it('applies [serviceId, moduleId] grouping when resolving queue names', async () => {
    flowManager = new ModuleAwareFlowManager(
      'test-service',
      new CommonBullmqFactoryNew(),
      supportedQueues,
      { isTest: true, redisConfig },
    )
    await flowManager.start()

    const node = await flowManager.addFlow({
      queueId: 'email-queue',
      data: {
        id: 'e1',
        email: 'a@b.c',
        metadata: { correlationId: 'c' },
      },
      children: [
        {
          queueId: 'sms-queue',
          data: { id: 's1', phone: '+1', metadata: { correlationId: 'c' } },
        },
      ],
    })

    expect(node.job.queueName).toBe('test-service.emails.email-queue')
    expect(node.children?.[0]?.job.queueName).toBe('test-service.phone.sms-queue')
  })

  it('sets lazyInitEnabled based on isTest', async () => {
    const testManager = new ModuleAwareFlowManager(
      'svc',
      new CommonBullmqFactoryNew(),
      supportedQueues,
      { isTest: true, redisConfig },
    )
    expect(testManager.config.lazyInitEnabled).toBe(false)

    const prodManager = new ModuleAwareFlowManager(
      'svc',
      new CommonBullmqFactoryNew(),
      supportedQueues,
      { isTest: false, redisConfig },
    )
    expect(prodManager.config.lazyInitEnabled).toBe(true)

    await testManager.dispose()
    await prodManager.dispose()
  })
})
