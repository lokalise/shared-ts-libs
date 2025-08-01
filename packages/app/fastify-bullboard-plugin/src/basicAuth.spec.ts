import fastifyAuth from '@fastify/auth'
import fastify, { type FastifyInstance } from 'fastify'
import { beforeAll, describe, expect } from 'vitest'
import { basicAuth } from './basicAuth.js'

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

  describe('configuration', () => {
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
