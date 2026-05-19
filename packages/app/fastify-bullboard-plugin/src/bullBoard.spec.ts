import type { QueueProLike } from '@bull-board/api/bullMQProAdapter'
import fastifySchedule from '@fastify/schedule'
import { Queue, type QueueOptions } from 'bullmq'
import fastify, { type FastifyInstance } from 'fastify'
import { beforeAll, expect, expectTypeOf } from 'vitest'
import {
  type BullBoardOptions,
  bullBoard,
  type QueueConstructor,
  type QueueProConstructor,
} from './bullBoard.ts'

const QueuePro: QueueProConstructor = Queue as unknown as QueueProConstructor
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
    it('QueueProConstructor accepts a real QueuePro-shaped ctor without a cast', () => {
      // Type-only check. A constructor whose opts extend `QueueOptions` (the real
      // `QueuePro` shape) must be assignable to `QueueProConstructor` directly —
      // downstream consumers paid an `as unknown as` tax while opts was typed as
      // `Record<string, unknown>`.
      interface FakeQueueProOptions extends QueueOptions {
        isPro?: boolean
      }
      type FakeQueueProCtor = new (name: string, opts?: FakeQueueProOptions) => QueueProLike
      expectTypeOf<FakeQueueProCtor>().toMatchTypeOf<QueueProConstructor>()
    })

    it('accepts registration with both queueConstructor and queueProConstructor provided', async () => {
      app = await initApp({
        queueConstructor: BullMqQueue,
        queueProConstructor: QueuePro,
        redisConfigs: [],
        basePath: '/test-mixed',
      })

      const response = await app.inject().get('/test-mixed').end()
      expect(response.statusCode).toBe(200)
      expect(response.body.toLowerCase()).includes('<!doctype html>')
    })

    it('throws when a pro config is provided without queueProConstructor', async () => {
      const promise = initApp({
        queueConstructor: BullMqQueue,
        redisConfigs: [{ host: 'localhost', port: 6379, useTls: false, isPro: true }],
        basePath: '/test-missing-pro',
      })
      await expect(promise).rejects.toThrow(/queueProConstructor is required/)
    })
  })
})
