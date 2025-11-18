import fastifySchedule from '@fastify/schedule'
import { Queue } from 'bullmq'
import fastify, { type FastifyInstance } from 'fastify'
import { beforeAll, expect } from 'vitest'
import { type BullBoardOptions, bullBoard, type QueueProConstructor } from './bullBoard.ts'

const QueuePro: QueueProConstructor = Queue as QueueProConstructor

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
        queueConstructor: QueuePro,
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
        queueConstructor: QueuePro,
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
        queueConstructor: QueuePro,
        redisConfigs: [],
        basePath: '/test-disabled',
        assetsPath: '/test-disabled/notfound',
      })
      const response = await app.inject().get('/test-disabled').end()

      expect(response.statusCode).toBe(500)
    })
  })

  describe('refresh enabled', () => {
    const startApp = async (preRegisterScheduler: boolean) => {
      app = await initApp(
        {
          queueConstructor: QueuePro,
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
})
