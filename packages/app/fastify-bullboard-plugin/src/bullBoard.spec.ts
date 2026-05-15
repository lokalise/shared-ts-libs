import fastifySchedule from '@fastify/schedule'
import { Queue } from 'bullmq'
import fastify, { type FastifyInstance } from 'fastify'
import { beforeAll, expect, vi } from 'vitest'
import {
  type BullBoardOptions,
  bullBoard,
  type QueueConstructor,
  type QueueProConstructor,
} from './bullBoard.ts'

vi.mock('@lokalise/background-jobs-common', async (orig) => {
  const actual = await orig<typeof import('@lokalise/background-jobs-common')>()
  return {
    ...actual,
    backgroundJobProcessorGetActiveQueueIds: vi.fn().mockResolvedValue([]),
  }
})

const { backgroundJobProcessorGetActiveQueueIds } = await import('@lokalise/background-jobs-common')

const BullMqQueue: QueueConstructor = Queue

async function initApp(
  options: BullBoardOptions,
  preRegisterScheduler = false,
): Promise<FastifyInstance> {
  const app = fastify()
  if (preRegisterScheduler) await app.register(fastifySchedule)

  await app.register(bullBoard, options)

  await app.ready()
  return app
}

describe('bull board', () => {
  let app: FastifyInstance

  afterAll(async () => {
    await app.close()
  })

  describe('refresh disabled', () => {
    beforeAll(async () => {
      app = await initApp({
        queueConstructor: BullMqQueue,
        redisConfigs: [],
        basePath: '/test-disabled',
      })
    })

    it('works', async () => {
      const response = await app.inject().get('/test-disabled').end()

      expect(response.statusCode).toBe(200)
      expect(response.body.toLowerCase()).includes('<!doctype html>')
      expect(response.body.toLowerCase()).includes('<title>bull dashboard</title>')

      expect(app.scheduler).toBeUndefined()
    })
  })

  describe('assets path set', () => {
    it('works', async () => {
      app = await initApp({
        queueConstructor: BullMqQueue,
        redisConfigs: [],
        basePath: '/test-disabled',
        assetsPath: '/test-disabled',
      })
      const response = await app.inject().get('/test-disabled').end()

      expect(response.statusCode).toBe(200)
      expect(response.body.toLowerCase()).includes('<!doctype html>')
      expect(response.body.toLowerCase()).includes('<title>bull dashboard</title>')
    })

    it('doesnt work', async () => {
      app = await initApp({
        queueConstructor: BullMqQueue,
        redisConfigs: [],
        basePath: '/test-disabled',
        assetsPath: '/test-disabled/notfound',
      })
      const response = await app.inject().get('/test-disabled').end()

      expect(response.body.toLowerCase()).includes('/test-disabled/notfound')
    })
  })

  describe('refresh enabled', () => {
    const startApp = async (preRegisterScheduler: boolean) => {
      app = await initApp(
        {
          queueConstructor: BullMqQueue,
          basePath: '/test-enabled',
          redisConfigs: [],
          refreshIntervalInSeconds: 1,
        },
        preRegisterScheduler,
      )
    }

    it.each([
      false,
      true,
    ])('should work if scheduler is already registered: %s', async (preRegisterScheduler) => {
      await startApp(preRegisterScheduler)

      const response = await app.inject().get('/test-enabled').end()

      expect(response.statusCode).toBe(200)
      expect(response.body.toLowerCase()).includes('<!doctype html>')
      expect(response.body.toLowerCase()).includes('<title>bull dashboard</title>')

      expect(app.scheduler).toBeDefined()
      const jobs = app.scheduler.getAllJobs()
      expect(jobs).toHaveLength(1)
      expect(jobs[0]!.id).toBe('bull-board-queues-update')
    })
  })

  describe('pro queue support', () => {
    it('throws when a pro config is provided without queueProConstructor', async () => {
      const promise = initApp({
        queueConstructor: BullMqQueue,
        redisConfigs: [{ host: 'localhost', port: 6379, useTls: false, isPro: true }],
        basePath: '/test-missing-pro',
      })
      await expect(promise).rejects.toThrow(/queueProConstructor is required/)
    })

    describe('queue discovery', () => {
      const fakeQueueSpy = vi.fn()
      const fakeProSpy = vi.fn()
      // bull-board verifies the queue identity at adapter construction time;
      // any `metaValues.version` starting with "bullmq" passes (BullMQ Pro is
      // built on BullMQ and identifies itself with a "bullmq-pro-..." version).
      const metaValues = { version: 'bullmq-5.0.0' }
      class FakeQueue {
        name: string
        opts: Record<string, unknown>
        metaValues = metaValues
        constructor(name: string, opts: Record<string, unknown>) {
          this.name = name
          this.opts = opts
          fakeQueueSpy(name, opts)
        }
        async close() {}
      }
      class FakeProQueue {
        name: string
        opts: Record<string, unknown>
        metaValues = metaValues
        constructor(name: string, opts: Record<string, unknown>) {
          this.name = name
          this.opts = opts
          fakeProSpy(name, opts)
        }
        async close() {}
      }

      beforeEach(() => {
        fakeQueueSpy.mockClear()
        fakeProSpy.mockClear()
      })

      it('builds Pro and non-Pro queues from mixed redisConfigs', async () => {
        vi.mocked(backgroundJobProcessorGetActiveQueueIds)
          .mockResolvedValueOnce(['plain-queue'])
          .mockResolvedValueOnce(['pro-queue'])

        app = await initApp({
          queueConstructor: FakeQueue as unknown as QueueConstructor,
          queueProConstructor: FakeProQueue as unknown as QueueProConstructor,
          redisConfigs: [
            { host: 'localhost', port: 6379, useTls: false, lazyConnect: true },
            {
              host: 'localhost',
              port: 6379,
              useTls: false,
              lazyConnect: true,
              isPro: true,
            },
          ],
          basePath: '/test-mixed-build',
        })

        expect(fakeQueueSpy).toHaveBeenCalledTimes(1)
        expect(fakeQueueSpy.mock.calls[0]?.[0]).toBe('plain-queue')
        expect(fakeProSpy).toHaveBeenCalledTimes(1)
        expect(fakeProSpy.mock.calls[0]?.[0]).toBe('pro-queue')
      })
    })
  })
})
