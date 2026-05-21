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
import { FlowManager } from './FlowManager.ts'
import {
  type ModuleAwareQueueConfiguration,
  ModuleAwareQueueManager,
} from './ModuleAwareQueueManager.ts'
import type {
  FlowChildJobInput,
  FlowJobInput,
  JobPayloadForQueue,
  QueueConfiguration,
} from './types.ts'

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
  let queueManager: FakeQueueManager<SupportedQueues>
  let flowManager: FakeFlowManager<SupportedQueues>

  beforeAll(() => {
    factory = new TestDependencyFactory()
    redisConfig = factory.getRedisConfig()
  })

  beforeEach(async () => {
    await factory.clearRedis()
    queueManager = new FakeQueueManager(supportedQueues, { redisConfig })
    flowManager = new FakeFlowManager(queueManager)
  })

  afterEach(async () => {
    await flowManager?.dispose()
    await queueManager?.dispose()
    await factory.clearRedis()
  })

  afterAll(async () => {
    await factory.dispose()
  })

  describe('lifecycle', () => {
    it('multiple start calls (sequential or concurrent) do not error', async () => {
      const localFlowManager = new FakeFlowManager(queueManager)

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
      const localFlowManager = new FakeFlowManager(queueManager)
      await expect(localFlowManager.dispose()).resolves.not.toThrowError()
      expect(localFlowManager.isStarted).toBe(false)
    })

    it('throws when scheduling without start and lazy init disabled', async () => {
      const localFlowManager = new FakeFlowManager(queueManager, { lazyInitEnabled: false })

      await expect(
        localFlowManager.addFlow({
          queueId: 'parent_queue',
          data: { id: 'a', value: 'v', metadata: { correlationId: 'c' } },
        }),
      ).rejects.toThrowError(/FlowManager not started/)
    })

    it('lazy-inits on addFlow', async () => {
      const localFlowManager = new FakeFlowManager(queueManager, { lazyInitEnabled: true })
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
    it('adds a root-only flow and records into the shared spy', async () => {
      const node = await flowManager.addFlow({
        queueId: 'parent_queue',
        data: { id: 'parent-1', value: 'hello', metadata: { correlationId: 'c1' } },
      })

      expect(node.job.id).toBeDefined()
      expect(node.job.name).toBe('parent_queue')

      // The same spy instance is exposed by both managers.
      expect(flowManager.getSpy('parent_queue')).toBe(queueManager.getSpy('parent_queue'))

      const spyResult = await queueManager
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
      const node = await flowManager.addFlow({
        queueId: 'dedup_queue',
        data: { id: '42', value: 'x', metadata: { correlationId: 'c' } },
      })

      expect(node.job.opts.deduplication?.id).toBe('42:x')
    })
  })

  describe('addFlowBulk', () => {
    it('adds multiple flows across different queues atomically', async () => {
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
    })
  })

  describe('spy', () => {
    it('delegates getSpy to the paired QueueManager (throws in production mode)', async () => {
      const prodQueueManager = new FakeQueueManager(supportedQueues, {
        redisConfig,
        isTest: false,
      })
      const prodFlowManager = new FakeFlowManager(prodQueueManager)

      expect(() => prodFlowManager.getSpy('parent_queue')).toThrowError(/spy was not instantiated/)
      await prodFlowManager.dispose()
      await prodQueueManager.dispose()
    })
  })

  describe('interop with ModuleAwareQueueManager', () => {
    const moduleAwareQueues = [
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

    it('inherits [serviceId, moduleId] grouping from a ModuleAwareQueueManager', async () => {
      const moduleAwareQueueManager = new ModuleAwareQueueManager(
        'test-service',
        new CommonBullmqFactoryNew(),
        moduleAwareQueues,
        { isTest: true, redisConfig },
      )
      const moduleAwareFlowManager = new FakeFlowManager(moduleAwareQueueManager)

      try {
        const node = await moduleAwareFlowManager.addFlow({
          queueId: 'email-queue',
          data: { id: 'e1', email: 'a@b.c', metadata: { correlationId: 'c' } },
          children: [
            {
              queueId: 'sms-queue',
              data: { id: 's1', phone: '+1', metadata: { correlationId: 'c' } },
            },
          ],
        })

        expect(node.job.queueName).toBe('test-service.emails.email-queue')
        expect(node.children?.[0]?.job.queueName).toBe('test-service.phone.sms-queue')

        // Shared spy: looking up either way returns the same instance.
        expect(moduleAwareFlowManager.getSpy('email-queue')).toBe(
          moduleAwareQueueManager.getSpy('email-queue'),
        )
      } finally {
        await moduleAwareFlowManager.dispose()
        await moduleAwareQueueManager.dispose()
      }
    })
  })

  describe('type inference', () => {
    type ParentPayload = JobPayloadForQueue<SupportedQueues, 'parent_queue'>
    type ChildPayload = JobPayloadForQueue<SupportedQueues, 'child_queue'>

    it('FlowJobInput discriminates payload by queueId', () => {
      expectTypeOf<FlowJobInput<SupportedQueues, 'parent_queue'>['data']>().toEqualTypeOf<{
        id: string
        value: string
        metadata: { correlationId: string }
      }>()
      expectTypeOf<FlowJobInput<SupportedQueues, 'child_queue'>['data']>().toEqualTypeOf<{
        id: string
        childValue: string
        metadata: { correlationId: string }
      }>()
    })

    it('FlowChildJobInput discriminates payload by queueId', () => {
      expectTypeOf<FlowChildJobInput<SupportedQueues, 'child_queue'>['data']>().toEqualTypeOf<{
        id: string
        childValue: string
        metadata: { correlationId: string }
      }>()
    })

    it('FlowChildJobInput.opts forbids deduplication/debounce/parent/repeat', () => {
      type ChildOpts = NonNullable<FlowChildJobInput<SupportedQueues>['opts']>
      expectTypeOf<ChildOpts>().not.toHaveProperty('deduplication')
      expectTypeOf<ChildOpts>().not.toHaveProperty('debounce')
      expectTypeOf<ChildOpts>().not.toHaveProperty('parent')
      expectTypeOf<ChildOpts>().not.toHaveProperty('repeat')
    })

    it('FlowJobInput root opts forbid repeat but allow deduplication', () => {
      type RootOpts = NonNullable<FlowJobInput<SupportedQueues>['opts']>
      expectTypeOf<RootOpts>().not.toHaveProperty('repeat')
      expectTypeOf<RootOpts>().toHaveProperty('deduplication')
    })

    it('getSpy infers payload type from queueId', () => {
      type ParentSpy = ReturnType<typeof flowManager.getSpy<'parent_queue'>>
      type ChildSpy = ReturnType<typeof flowManager.getSpy<'child_queue'>>

      // The spy's `waitForJobWithId` resolves with a SafeJob whose data matches.
      expectTypeOf<
        Awaited<ReturnType<ParentSpy['waitForJobWithId']>>['data']
      >().toMatchTypeOf<ParentPayload>()
      expectTypeOf<
        Awaited<ReturnType<ChildSpy['waitForJobWithId']>>['data']
      >().toMatchTypeOf<ChildPayload>()
    })

    it('rejects invalid queueId in addFlow / addFlowBulk / getFlow / getSpy', () => {
      // Wrapped in an unused function so type-checks fire at compile time but
      // no runtime call is made (avoids unhandled rejections from invalid
      // payloads landing on Bull/Zod).
      const _typeCheck = (m: FakeFlowManager<SupportedQueues>) => {
        // @ts-expect-error - 'bogus_queue' is not a valid queueId
        void m.addFlow({ queueId: 'bogus_queue', data: {} })
        // @ts-expect-error - 'bogus_queue' is not a valid queueId
        void m.addFlowBulk([{ queueId: 'bogus_queue', data: {} }])
        // @ts-expect-error - 'bogus_queue' is not a valid queueId
        void m.getFlow({ queueId: 'bogus_queue', id: 'x' })
        // @ts-expect-error - 'bogus_queue' is not a valid queueId
        void m.getSpy('bogus_queue')
      }
      expect(typeof _typeCheck).toBe('function')
    })

    it("rejects another queue's payload shape", () => {
      const _typeCheck = (m: FakeFlowManager<SupportedQueues>) => {
        void m.addFlow({
          queueId: 'parent_queue',
          // @ts-expect-error - childValue belongs to child_queue, not parent_queue
          data: { id: 'p', childValue: 'cv', metadata: { correlationId: 'c' } },
        })

        void m.addFlow({
          queueId: 'parent_queue',
          data: { id: 'p', value: 'v', metadata: { correlationId: 'c' } },
          children: [
            {
              queueId: 'child_queue',
              // @ts-expect-error - value belongs to parent_queue, not child_queue
              data: { id: 'c', value: 'v', metadata: { correlationId: 'c' } },
            },
          ],
        })
      }
      expect(typeof _typeCheck).toBe('function')
    })

    it('a ModuleAwareQueueManager pairs cleanly with FlowManager', () => {
      const typeTestQueues = [
        {
          queueId: 'q',
          moduleId: 'mod',
          jobPayloadSchema: z.object({
            id: z.string(),
            metadata: z.object({ correlationId: z.string() }),
          }),
        },
      ] as const satisfies ModuleAwareQueueConfiguration[]

      const localQueueManager = new ModuleAwareQueueManager(
        'svc',
        new CommonBullmqFactoryNew(),
        typeTestQueues,
        { isTest: true, redisConfig },
      )

      // Compilation IS the assertion — if `Queues` weren't inferred through
      // the QueueManager param, `addFlow` below would demand `never` for data.
      const fm = new FlowManager(
        {
          flowProducerFactory: new CommonBullmqFactoryNew(),
          queueManager: localQueueManager,
        },
        { lazyInitEnabled: true },
      )

      const _typeCheck = () => {
        // @ts-expect-error - 'wrong-queue' is not in the ModuleAware registry
        void fm.addFlow({ queueId: 'wrong-queue', data: {} })
        void fm.addFlow({
          queueId: 'q',
          data: { id: '1', metadata: { correlationId: 'c' } },
        })
      }
      expect(typeof _typeCheck).toBe('function')

      void localQueueManager.dispose()
      void fm.dispose()
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

      const manager = new FlowManager(
        { flowProducerFactory: factory, queueManager },
        { lazyInitEnabled: true },
      )

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

      const manager = new FlowManager(
        { flowProducerFactory: factory, queueManager },
        { lazyInitEnabled: true },
      )

      const startPromise = manager.start()
      const disposePromise = manager.dispose()
      releaseReady?.()

      await startPromise
      await disposePromise

      expect(manager.isStarted).toBe(false)
    })
  })
})
