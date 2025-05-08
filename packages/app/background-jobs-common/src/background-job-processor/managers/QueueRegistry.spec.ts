import type { JobsOptions, Queue, QueueOptions } from 'bullmq'
import { z } from 'zod'
import { QueueRegistry } from './QueueRegistry.ts'
import type { QueueConfiguration } from './types.ts'
import { getTestRedisConfig } from '../../../test/TestRedis.ts'
import { CommonBullmqFactory } from '../factories/index.ts'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import { afterEach, expectTypeOf } from 'vitest'

const jobPayloadSchema = z.object({
  id: z.string(),
  value: z.string(),
  metadata: z.object({
    correlationId: z.string(),
  }),
})

const jobPayloadSchema2 = z.object({
  id: z.string(),
  value: z.string(),
  value2: z.string(),
  metadata: z.object({
    correlationId: z.string(),
  }),
})

const QUEUES = [
  {
    queueId: 'queue1',
    jobPayloadSchema,
    queueOptions: { skipMetasUpdate: true },
  },
  {
    queueId: 'queue2',
    jobPayloadSchema: jobPayloadSchema2,
    jobOptions: { attempts: 10 },
  },
  {
    queueId: 'queue3',
    jobPayloadSchema,
    bullDashboardGrouping: ['group1', 'group2'],
  },
] as const satisfies QueueConfiguration[]

describe('QueueRegistry', () => {
  let testFactory: TestDependencyFactory
  let registry: QueueRegistry<typeof QUEUES, Queue, QueueOptions, JobsOptions>

  beforeAll(() => {
    testFactory = new TestDependencyFactory()
  })

  beforeEach(async () => {
    await testFactory.clearRedis()
    registry = new QueueRegistry(QUEUES, new CommonBullmqFactory(), getTestRedisConfig())
  })

  afterEach(async () => {
    await registry.dispose()
  })

  afterAll(async () => {
    await testFactory.dispose()
  })

  it('should register queue ids correctly', () => {
    expect(registry.queueIds).toEqual(new Set(['queue1', 'queue2']))
  })

  it('should work with QueueConfiguration extensions', () => {
    type ExtendedQueueConfig = QueueConfiguration & { customField: string }
    const extendedQueues = [
      {
        queueId: 'queue',
        jobPayloadSchema,
        customField: 'test',
      },
    ] as const satisfies ExtendedQueueConfig[]

    const extendedRegistry = new QueueRegistry(
      extendedQueues,
      new CommonBullmqFactory(),
      getTestRedisConfig(),
    )
    const config = extendedRegistry.getQueueConfig('queue')
    expect(config).toBe(extendedQueues[0])
    expectTypeOf(config).toMatchTypeOf<ExtendedQueueConfig>()
  })

  describe('start - dispose', () => {
    it('should throw an error if queue id is not supported', async () => {
      await expect(() => registry.start(['invalidQueueId'])).rejects.toMatchInlineSnapshot(
        '[Error: queueId invalidQueueId not supported]',
      )
    })

    it('should be ignored if empty array is specified', async () => {
      expect(registry.isStarted).toBe(false)
      await registry.start([])
      expect(registry.isStarted).toBe(false)
    })

    it('should start and dispose given queues correctly', async () => {
      await registry.start(['queue1'])

      expect(registry.isStarted).toBe(true)
      expect(() => registry.getQueue('queue1')).toBeDefined()
      expect(() => registry.getQueue('queue2')).toThrowErrorMatchingInlineSnapshot(
        '[Error: queue queue2 was not instantiated yet, please run "start()"]',
      )

      await registry.dispose()

      expect(registry.isStarted).toBe(false)
      expect(() => registry.getQueue('queue1')).toThrowErrorMatchingInlineSnapshot(
        '[Error: queue queue1 was not instantiated yet, please run "start()"]',
      )
    })

    it('should start all queues', async () => {
      await registry.start(true)

      expect(registry.isStarted).toBe(true)
      expect(QUEUES.map(({ queueId }) => registry.getQueue(queueId)).every((queue) => queue)).toBe(
        true,
      )

      await registry.dispose()
      expect(registry.isStarted).toBe(false)
    })

    it('should resolve queue id for grouping', async () => {
      await registry.start(['queue3'])

      expect(registry.isStarted).toBe(true)
      expect(registry.getQueue('queue3').name).toEqual('group1.group2.queue3')

      await registry.dispose()
      expect(registry.isStarted).toBe(false)
    })
  })

  describe('getQueueConfig', () => {
    it('should return the correct config by queue id', () => {
      const config1 = registry.getQueueConfig('queue1')
      expect(config1).toBe(QUEUES[0])

      const config2 = registry.getQueueConfig('queue2')
      expect(config2).toBe(QUEUES[1])
    })

    it('should throw an error if queue id is not supported', () => {
      // @ts-expect-error - TS checks that only valid queue ids are passed
      expect(() => registry.getQueueConfig('invalidQueueId')).toThrowError()
    })
  })
})
