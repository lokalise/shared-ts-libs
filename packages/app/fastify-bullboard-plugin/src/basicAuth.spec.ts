import { createBullBoard } from '@bull-board/api'
import { FastifyAdapter } from '@bull-board/fastify'
import fastifyAuth from '@fastify/auth'
import fastify, { type FastifyInstance } from 'fastify'
import { beforeAll, describe, expect } from 'vitest'
import { basicAuth } from './basicAuth.ts'

const skippedEndpoint = '/skipAuth'
const enabledEndpoint = '/'

async function initApp(authEnabled: boolean) {
  const app = fastify()
  await app.register(basicAuth, {
    config: { isEnabled: authEnabled, username: 'test', password: 'test' },
    enableList: new Set([enabledEndpoint]),
  })

  app.route({
    method: 'GET',
    url: '/',
    handler: (_req, reply) => {
      return reply.status(200).send({ hello: 'world' })
    },
  })

  app.route({
    method: 'GET',
    url: skippedEndpoint,
    handler: (_req, reply) => {
      return reply.status(200).send({ hello: 'my friend' })
    },
  })

  await app.ready()
  return app
}

describe('basicAuth', () => {
  let app: FastifyInstance

  afterAll(async () => {
    await app.close()
  })

  const performRequest = async (path: string) => app.inject().get(path).end()

  describe('auth enabled', () => {
    beforeAll(async () => {
      app = await initApp(true)
    })

    it('returns 401 on not skipped endpoints', async () => {
      const response = await performRequest('/')
      expect(response.statusCode).toBe(401)
    })

    it('works on skipped endpoints', async () => {
      const response = await performRequest(skippedEndpoint)
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ hello: 'my friend' })
    })
  })

  describe('prefixed mount', () => {
    let prefixedApp: FastifyInstance
    const validAuthHeader = `Basic ${Buffer.from('test:test').toString('base64')}`
    const invalidAuthHeader = `Basic ${Buffer.from('test:wrong').toString('base64')}`

    const protectedRequests = [
      { method: 'GET', url: '/bull' },
      { method: 'GET', url: '/bull/' },
      { method: 'GET', url: '/bull/api/queues' },
      { method: 'GET', url: '/bull/static/main.js' },
      { method: 'PUT', url: '/bull/api/queues/my-queue/1/retry' },
    ] as const

    beforeAll(async () => {
      prefixedApp = fastify()
      await prefixedApp.register(basicAuth, {
        config: { isEnabled: true, username: 'test', password: 'test' },
        enableList: new Set(['/bull']),
      })

      for (const url of [
        '/bull',
        '/bull/',
        '/bull/api/queues',
        '/bull/static/*',
        '/bullet',
        '/health',
      ]) {
        prefixedApp.get(url, (_req, reply) => reply.status(200).send({ url }))
      }
      prefixedApp.put('/bull/api/queues/:queueName/:jobId/retry', (_req, reply) =>
        reply.status(200).send({ retried: true }),
      )

      await prefixedApp.ready()
    })

    afterAll(async () => {
      await prefixedApp.close()
    })

    it.each(protectedRequests)(
      'returns 401 on $method $url without credentials',
      async ({ method, url }) => {
        const response = await prefixedApp.inject({ method, url })
        expect(response.statusCode).toBe(401)
      },
    )

    it.each(protectedRequests)(
      'returns 401 on $method $url with wrong credentials',
      async ({ method, url }) => {
        const response = await prefixedApp.inject({
          method,
          url,
          headers: { authorization: invalidAuthHeader },
        })
        expect(response.statusCode).toBe(401)
      },
    )

    it.each(protectedRequests)(
      'returns 200 on $method $url with valid credentials',
      async ({ method, url }) => {
        const response = await prefixedApp.inject({
          method,
          url,
          headers: { authorization: validAuthHeader },
        })
        expect(response.statusCode).toBe(200)
      },
    )

    it('does not protect routes that only share a string prefix', async () => {
      const response = await prefixedApp.inject().get('/bullet').end()
      expect(response.statusCode).toBe(200)
    })

    it('does not protect routes outside the listed path', async () => {
      const response = await prefixedApp.inject().get('/health').end()
      expect(response.statusCode).toBe(200)
    })
  })

  describe('enableList normalization', () => {
    async function initNormalizationApp(enableList: string[]) {
      const normalizationApp = fastify()
      await normalizationApp.register(basicAuth, {
        config: { isEnabled: true, username: 'test', password: 'test' },
        enableList: new Set(enableList),
      })
      for (const url of ['/bull', '/bull/', '/bull/api/queues', '/health']) {
        normalizationApp.get(url, (_req, reply) => reply.status(200).send({ url }))
      }
      await normalizationApp.ready()
      return normalizationApp
    }

    it('protects the bare path when the entry has a trailing slash', async () => {
      const normalizationApp = await initNormalizationApp(['/bull/'])

      expect((await normalizationApp.inject().get('/bull').end()).statusCode).toBe(401)
      expect((await normalizationApp.inject().get('/bull/').end()).statusCode).toBe(401)
      expect((await normalizationApp.inject().get('/bull/api/queues').end()).statusCode).toBe(401)
      expect((await normalizationApp.inject().get('/health').end()).statusCode).toBe(200)

      await normalizationApp.close()
    })

    it('ignores empty entries instead of protecting every route', async () => {
      const normalizationApp = await initNormalizationApp(['/bull', ''])

      expect((await normalizationApp.inject().get('/bull/api/queues').end()).statusCode).toBe(401)
      expect((await normalizationApp.inject().get('/health').end()).statusCode).toBe(200)

      await normalizationApp.close()
    })

    it('matches the root path exactly', async () => {
      const normalizationApp = await initNormalizationApp(['/'])

      expect((await normalizationApp.inject().get('/bull/api/queues').end()).statusCode).toBe(200)
      expect((await normalizationApp.inject().get('/health').end()).statusCode).toBe(200)

      await normalizationApp.close()
    })
  })

  describe('bull-board mount', () => {
    const validAuthHeader = `Basic ${Buffer.from('test:test').toString('base64')}`

    async function initBullBoardApp(enableList: string[], parentPrefix?: string) {
      const bullBoardApp = fastify()
      await bullBoardApp.register(basicAuth, {
        config: { isEnabled: true, username: 'test', password: 'test' },
        enableList: new Set(enableList),
      })

      const serverAdapter = new FastifyAdapter()
      createBullBoard({ queues: [], serverAdapter })
      serverAdapter.setBasePath(`${parentPrefix ?? ''}/bull`)

      await bullBoardApp.register(
        async (scope) => {
          await scope.register(serverAdapter.registerPlugin(), { prefix: '/bull' })
        },
        { prefix: parentPrefix ?? '' },
      )
      await bullBoardApp.ready()
      return bullBoardApp
    }

    it('protects the real bull-board routes', async () => {
      const bullBoardApp = await initBullBoardApp(['/bull'])

      const unauthenticatedRequests = [
        { method: 'GET', url: '/bull' },
        { method: 'GET', url: '/bull/api/queues' },
        { method: 'GET', url: '/bull/api/queues/my-queue/1' },
        { method: 'PUT', url: '/bull/api/queues/my-queue/obliterate' },
        { method: 'PUT', url: '/bull/api/queues/my-queue/1/retry' },
      ] as const
      for (const { method, url } of unauthenticatedRequests) {
        expect((await bullBoardApp.inject({ method, url })).statusCode, `${method} ${url}`).toBe(
          401,
        )
      }

      const authenticated = await bullBoardApp.inject({
        method: 'GET',
        url: '/bull/api/queues',
        headers: { authorization: validAuthHeader },
      })
      expect(authenticated.statusCode).toBe(200)

      await bullBoardApp.close()
    })

    it('protects bull-board under a parent prefix when the full path is listed', async () => {
      const bullBoardApp = await initBullBoardApp(['/admin/bull'], '/admin')

      expect((await bullBoardApp.inject().get('/admin/bull').end()).statusCode).toBe(401)
      expect((await bullBoardApp.inject().get('/admin/bull/api/queues').end()).statusCode).toBe(401)

      await bullBoardApp.close()
    })
  })

  describe('skipList', () => {
    let skipListApp: FastifyInstance
    const validAuthHeader = `Basic ${Buffer.from('test:test').toString('base64')}`
    const invalidAuthHeader = `Basic ${Buffer.from('test:wrong').toString('base64')}`

    const protectedRequests = [
      { method: 'GET', url: '/' },
      { method: 'GET', url: '/bull' },
      { method: 'GET', url: '/bull/api/queues' },
      { method: 'GET', url: '/health/deep' },
      { method: 'GET', url: '/not-registered' },
    ] as const

    beforeAll(async () => {
      skipListApp = fastify()
      await skipListApp.register(basicAuth, {
        config: { isEnabled: true, username: 'test', password: 'test' },
        skipList: new Set(['/health', '/metrics']),
      })

      for (const url of ['/', '/bull', '/bull/api/queues', '/health', '/health/deep', '/metrics']) {
        skipListApp.get(url, (_req, reply) => reply.status(200).send({ url }))
      }

      await skipListApp.ready()
    })

    afterAll(async () => {
      await skipListApp.close()
    })

    it.each(['/health', '/metrics'])('does not require auth on skipped %s', async (url) => {
      const response = await skipListApp.inject().get(url).end()
      expect(response.statusCode).toBe(200)
    })

    it.each(protectedRequests)(
      'returns 401 on $method $url without credentials',
      async ({ method, url }) => {
        const response = await skipListApp.inject({ method, url })
        expect(response.statusCode).toBe(401)
      },
    )

    it.each(protectedRequests)(
      'returns 401 on $method $url with wrong credentials',
      async ({ method, url }) => {
        const response = await skipListApp.inject({
          method,
          url,
          headers: { authorization: invalidAuthHeader },
        })
        expect(response.statusCode).toBe(401)
      },
    )

    it('returns 200 on a protected route with valid credentials', async () => {
      const response = await skipListApp.inject({
        method: 'GET',
        url: '/bull/api/queues',
        headers: { authorization: validAuthHeader },
      })
      expect(response.statusCode).toBe(200)
    })

    it('returns 404 on an unregistered route with valid credentials', async () => {
      const response = await skipListApp.inject({
        method: 'GET',
        url: '/not-registered',
        headers: { authorization: validAuthHeader },
      })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('configuration', () => {
    it('throws if both enableList and skipList are passed', async () => {
      const app = fastify()
      // @ts-expect-error -- the two lists are mutually exclusive
      app.register(basicAuth, {
        config: { isEnabled: true, username: 'test', password: 'test' },
        enableList: new Set(['/bull']),
        skipList: new Set(['/health']),
      })

      await expect(app.ready()).rejects.toThrow(/mutually exclusive/)
    })

    it('throws if neither enableList nor skipList is passed', async () => {
      const app = fastify()
      // @ts-expect-error -- one of the lists is required
      app.register(basicAuth, {
        config: { isEnabled: true, username: 'test', password: 'test' },
      })

      await expect(app.ready()).rejects.toThrow(/either enableList or skipList is required/)
    })

    it('does not crash if auth plugin is already installed', async () => {
      const app = fastify()
      await app.register(fastifyAuth)
      await app.register(basicAuth, {
        config: { isEnabled: true, username: 'test', password: 'test' },
        enableList: new Set([enabledEndpoint]),
      })
    })
  })

  describe('auth disabled', () => {
    beforeAll(async () => {
      app = await initApp(false)
    })

    it('works on not skipped endpoints', async () => {
      const response = await performRequest('/')
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ hello: 'world' })
    })

    it('works on skipped endpoints', async () => {
      const response = await performRequest(skippedEndpoint)
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ hello: 'my friend' })
    })
  })
})
