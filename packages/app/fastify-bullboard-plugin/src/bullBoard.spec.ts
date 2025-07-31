import { Queue } from 'bullmq'
import fastify, { type FastifyInstance } from 'fastify'
import { beforeAll, expect } from 'vitest'
import { type BullBoardOptions, bullBoard, type QueueProConstructor } from './bullBoard.js'

const QueuePro: QueueProConstructor = Queue as QueueProConstructor

async function initApp(options: BullBoardOptions) {
  const app = fastify()

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
        redisInstances: [],
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

  describe('refresh enabled', () => {
    beforeAll(async () => {
      app = await initApp({
        queueConstructor: Queue,
        redisConfigs: [],
        basePath: '/test-enabled',
        refreshIntervalInSeconds: 1,
      })
    })

    it('works', async () => {
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
