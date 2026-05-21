import type { RedisConfig } from '@lokalise/node-core'
import type { FlowProducer, QueueBaseOptions } from 'bullmq'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest'
import { z } from 'zod/v4'
import { TestDependencyFactory } from '../../../test/TestDependencyFactory.ts'
import type { BullmqFlowProducerFactory } from '../factories/BullmqFlowProducerFactory.ts'
import { CommonBullmqFactoryNew } from '../factories/CommonBullmqFactoryNew.ts'
import { FakeFlowManager } from './FakeFlowManager.ts'
import { FakeQueueManager } from './FakeQueueManager.ts'
import { type FlowJobInput, FlowManager } from './FlowManager.ts'
import type { QueueConfiguration } from './types.ts'

const supportedQueues = [
  {
    queueId: 'parent_queue',
    jobPayloadSchema: z
      .object({
        id: z.string(),
        value: z.string(),
        metadata: z.object({ correlationId: z.string() }),
      })
      .strict(),
  },
  {
    queueId: 'child_queue',
    jobPayloadSchema: z
      .object({
        id: z.string(),
        childValue: z.string(),
        metadata: z.object({ correlationId: z.string() }),
      })
      .strict(),
  },
  {
    queueId: 'grouped_queue',
    bullDashboardGrouping: ['service', 'module'],
    jobPayloadSchema: z.object({
      id: z.string(),
      groupedValue: z.string(),
      metadata: z.object({ correlationId: z.string() }),
    }),
  },
  {
    queueId: 'dedup_queue',
    jobPayloadSchema: z.object({
      id: z.string(),
      value: z.string(),
      metadata: z.object({ correlationId: z.string() }),
    }),
    jobOptions: {
      deduplication: {
        idBuilder: (data: { id: string; value: string }) => `${data.id}:${data.value}`,
        ttl: 500,
      },
    },
  },
] as const satisfies QueueConfiguration[]

type SupportedQueues = typeof supportedQueues

describe('FlowManager', () => {
  let factory: TestDependencyFactory
  let redisConfig: RedisConfig
  let flowManager: FakeFlowManager<SupportedQueues>

  beforeAll(() => {
    factory = new TestDependencyFactory()
    redisConfig = factory.getRedisConfig()
  })

  beforeEach(async () => {
    await factory.clearRedis()
    flowManager = new FakeFlowManager(supportedQueues, {
      redisConfig,
      lazyInitEnabled: true,
    })
  })

  afterEach(async () => {
    await flowManager?.dispose()
    await factory.clearRedis()
  })

  afterAll(async () => {
    await factory.dispose()
  })

  describe('lifecycle', () => {
    it('multiple start calls (sequential or concurrent) do not error', async () => {
      const localFlowManager = new FakeFlowManager(supportedQueues, { redisConfig })

      await expect(localFlowManager.start()).resolves.not.toThrowError()
      await expect(localFlowManager.start()).resolves.not.toThrowError()
      expect(localFlowManager.isStarted).toBe(true)
      await localFlowManager.dispose()

      await expect(
        Promise.all([localFlowManager.start(), localFlowManager.start()]),
      ).resolves.not.toThrowError()
      expect(localFlowManager.isStarted).toBe(true)
      await localFlowManager.dispose()
    })

    it('dispose is a no-op when not started', async () => {
      const localFlowManager = new FakeFlowManager(supportedQueues, { redisConfig })
      await expect(localFlowManager.dispose()).resolves.not.toThrowError()
      expect(localFlowManager.isStarted).toBe(false)
    })

    it('throws when scheduling without start and lazy init disabled', async () => {
      const localFlowManager = new FakeFlowManager(supportedQueues, {
        redisConfig,
        lazyInitEnabled: false,
      })

      await expect(
        localFlowManager.addFlow({
          queueId: 'parent_queue',
          data: { id: 'a', value: 'v', metadata: { correlationId: 'c' } },
        }),
      ).rejects.toThrowError(/FlowManager not started/)
    })

    it('lazy-inits on addFlow', async () => {
      const localFlowManager = new FakeFlowManager(supportedQueues, {
        redisConfig,
        lazyInitEnabled: true,
      })
      expect(localFlowManager.isStarted).toBe(false)

      await localFlowManager.addFlow({
        queueId: 'parent_queue',
        data: { id: 'a', value: 'v', metadata: { correlationId: 'c' } },
      })

      expect(localFlowManager.isStarted).toBe(true)
      await localFlowManager.dispose()
    })
  })

  describe('addFlow', () => {
    it('adds a root-only flow and records spy', async () => {
      const node = await flowManager.addFlow({
        queueId: 'parent_queue',
        data: { id: 'parent-1', value: 'hello', metadata: { correlationId: 'c1' } },
      })

      expect(node.job.id).toBeDefined()
      expect(node.job.name).toBe('parent_queue')

      const spyResult = await flowManager
        .getSpy('parent_queue')
        .waitForJobWithId(node.job.id, 'scheduled')
      expect(spyResult.data).toMatchObject({
        id: 'parent-1',
        value: 'hello',
        metadata: { correlationId: 'c1' },
      })
    })

    it('adds parent + children across different queues, records spies for each', async () => {
      const node = await flowManager.addFlow({
        queueId: 'parent_queue',
        data: { id: 'p', value: 'pv', metadata: { correlationId: 'c' } },
        children: [
          {
            queueId: 'child_queue',
            data: { id: 'c1', childValue: 'cv1', metadata: { correlationId: 'c' } },
          },
          {
            queueId: 'child_queue',
            data: { id: 'c2', childValue: 'cv2', metadata: { correlationId: 'c' } },
          },
        ],
      })

      expect(node.children).toHaveLength(2)

      await flowManager.getSpy('parent_queue').waitForJobWithId(node.job.id, 'scheduled')
      for (const child of node.children ?? []) {
        const childSpy = await flowManager
          .getSpy('child_queue')
          .waitForJobWithId(child.job.id, 'scheduled')
        expect(childSpy.data).toMatchObject({ metadata: { correlationId: 'c' } })
      }
    })

    it('uses dashboard grouping when resolving queue name', async () => {
      const node = await flowManager.addFlow({
        queueId: 'grouped_queue',
        data: { id: 'g', groupedValue: 'gv', metadata: { correlationId: 'c' } },
      })

      expect(node.job.queueName).toBe('service.module.grouped_queue')
    })

    it('throws on invalid root payload', async () => {
      await expect(
        flowManager.addFlow({
          queueId: 'parent_queue',
          // @ts-expect-error missing required id field
          data: { value: 'v', metadata: { correlationId: 'c' } },
        }),
      ).rejects.toThrowError(/Invalid input/)
    })

    it('throws on invalid child payload', async () => {
      await expect(
        flowManager.addFlow({
          queueId: 'parent_queue',
          data: { id: 'p', value: 'v', metadata: { correlationId: 'c' } },
          children: [
            {
              queueId: 'child_queue',
              // @ts-expect-error missing required childValue
              data: { id: 'c', metadata: { correlationId: 'c' } },
            },
          ],
        }),
      ).rejects.toThrowError(/Invalid input/)
    })

    it('applies deduplication idBuilder on root', async () => {
      const dedupManager = new FakeFlowManager(supportedQueues, {
        redisConfig,
        lazyInitEnabled: true,
      })

      const node = await dedupManager.addFlow({
        queueId: 'dedup_queue',
        data: { id: '42', value: 'x', metadata: { correlationId: 'c' } },
      })

      expect(node.job.opts.deduplication?.id).toBe('42:x')
      await dedupManager.dispose()
    })

    it('infers payload type from queueId', () => {
      // type-level check — no need to call
      expectTypeOf<FlowJobInput<SupportedQueues, 'parent_queue'>>().toMatchTypeOf<{
        queueId: 'parent_queue'
        data: { id: string; value: string; metadata: { correlationId: string } }
      }>()
      expectTypeOf<FlowJobInput<SupportedQueues, 'child_queue'>>().toMatchTypeOf<{
        queueId: 'child_queue'
        data: { id: string; childValue: string; metadata: { correlationId: string } }
      }>()
    })
  })

  describe('addFlowBulk', () => {
    it('adds multiple flows', async () => {
      const nodes = await flowManager.addFlowBulk([
        {
          queueId: 'parent_queue',
          data: { id: 'a', value: 'va', metadata: { correlationId: 'c' } },
          children: [
            {
              queueId: 'child_queue',
              data: { id: 'ca', childValue: 'cva', metadata: { correlationId: 'c' } },
            },
          ],
        },
        {
          queueId: 'parent_queue',
          data: { id: 'b', value: 'vb', metadata: { correlationId: 'c' } },
        },
      ])

      expect(nodes).toHaveLength(2)
      for (const node of nodes) {
        await flowManager.getSpy('parent_queue').waitForJobWithId(node.job.id, 'scheduled')
      }
    })

    it('returns empty array for empty input', async () => {
      const nodes = await flowManager.addFlowBulk([])
      expect(nodes).toEqual([])
    })
  })

  describe('getFlow', () => {
    it('retrieves a previously added flow tree by queueId and root id', async () => {
      const node = await flowManager.addFlow({
        queueId: 'parent_queue',
        data: { id: 'p', value: 'v', metadata: { correlationId: 'c' } },
        children: [
          {
            queueId: 'child_queue',
            data: { id: 'c', childValue: 'cv', metadata: { correlationId: 'c' } },
          },
        ],
      })

      const fetched = await flowManager.getFlow({ queueId: 'parent_queue', id: node.job.id! })
      expect(fetched.job.id).toBe(node.job.id)
      expect(fetched.children).toHaveLength(1)
    })
  })

  describe('interop with QueueManager', () => {
    it('jobs added via FlowManager appear in the matching Queue', async () => {
      const queueManager = new FakeQueueManager(supportedQueues, { redisConfig })
      try {
        await queueManager.start(['parent_queue', 'child_queue'])

        const node = await flowManager.addFlow({
          queueId: 'parent_queue',
          data: { id: 'p', value: 'v', metadata: { correlationId: 'c' } },
          children: [
            {
              queueId: 'child_queue',
              data: { id: 'c', childValue: 'cv', metadata: { correlationId: 'c' } },
            },
          ],
        })

        // Parent should be waiting-children until child completes; both are countable.
        expect(await queueManager.getJobCount('parent_queue')).toBeGreaterThanOrEqual(1)
        expect(await queueManager.getJobCount('child_queue')).toBeGreaterThanOrEqual(1)
        expect(node.job.id).toBeDefined()
      } finally {
        await queueManager.dispose()
      }
    })
  })

  describe('spy', () => {
    it('throws when spy is requested but isTest is false', async () => {
      const prodManager = new FakeFlowManager(supportedQueues, {
        redisConfig,
        isTest: false,
      })

      expect(() => prodManager.getSpy('parent_queue')).toThrowError(/spy was not instantiated/)
      await prodManager.dispose()
    })
  })

  describe('start failure recovery', () => {
    it('clears startPromise on failure so a subsequent start can succeed', async () => {
      const realFactory = new CommonBullmqFactoryNew()
      let shouldFail = true
      const closedProducers: FlowProducer[] = []

      const factory: BullmqFlowProducerFactory = {
        buildFlowProducer: (options: QueueBaseOptions) => {
          const producer = realFactory.buildFlowProducer(options)
          if (shouldFail) {
            // Force the first start to reject — and prove the producer is
            // closed (no leaked connection) by tracking close() calls.
            const close = producer.close.bind(producer)
            producer.close = () => {
              closedProducers.push(producer)
              return close()
            }
            producer.waitUntilReady = () => Promise.reject(new Error('simulated startup failure'))
          }
          return producer
        },
      }

      const manager = new FlowManager(factory, supportedQueues, {
        redisConfig,
        isTest: true,
        lazyInitEnabled: true,
      })

      await expect(manager.start()).rejects.toThrowError('simulated startup failure')
      expect(manager.isStarted).toBe(false)
      expect(closedProducers).toHaveLength(1)

      shouldFail = false
      await expect(manager.start()).resolves.not.toThrowError()
      expect(manager.isStarted).toBe(true)

      await manager.dispose()
    })

    it('dispose during an in-flight start closes the producer that resolves', async () => {
      const realFactory = new CommonBullmqFactoryNew()
      let releaseReady: (() => void) | undefined
      const readyGate = new Promise<void>((resolve) => {
        releaseReady = resolve
      })

      const factory: BullmqFlowProducerFactory = {
        buildFlowProducer: (options: QueueBaseOptions) => {
          const producer = realFactory.buildFlowProducer(options)
          const originalReady = producer.waitUntilReady.bind(producer)
          producer.waitUntilReady = async () => {
            await readyGate
            return originalReady()
          }
          return producer
        },
      }

      const manager = new FlowManager(factory, supportedQueues, {
        redisConfig,
        isTest: true,
        lazyInitEnabled: true,
      })

      const startPromise = manager.start()
      const disposePromise = manager.dispose()
      releaseReady?.()

      await startPromise
      await disposePromise

      expect(manager.isStarted).toBe(false)
    })
  })
})
