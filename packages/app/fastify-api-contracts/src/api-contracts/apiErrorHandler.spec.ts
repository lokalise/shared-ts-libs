import type { AddressInfo } from 'node:net'
import * as fastifySSEImport from '@fastify/sse'
import { defineApiContract, sseBody } from '@lokalise/api-contracts'
import fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyPluginAsync,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import {
  buildApiRouteErrorHandler,
  fastifyApiContracts,
  type ResolveApiErrorResponse,
} from './apiErrorHandler.ts'
import { buildFastifyApiRoute } from './buildFastifyApiRoute.ts'
import { buildApiSSEContext } from './sseUtils.ts'

const fastifySSE = (fastifySSEImport as unknown as { default: FastifyPluginAsync }).default

const jsonContract = defineApiContract({
  method: 'get',
  summary: 'Get a user',
  pathResolver: () => '/users',
  responsesByStatusCode: { 200: z.object({ id: z.string() }) },
})

const sseContract = defineApiContract({
  method: 'get',
  summary: 'Stream updates',
  pathResolver: () => '/stream',
  responsesByStatusCode: {
    200: { content: { 'text/event-stream': sseBody({ update: z.object({ value: z.number() }) }) } },
  },
})

const resolveToTeapot: ResolveApiErrorResponse = (error) => ({
  statusCode: 418,
  payload: { mapped: (error as Error).message },
})

async function buildApp(): Promise<FastifyInstance> {
  const app = fastify().withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(fastifySSE)
  return app
}

let app: FastifyInstance
afterEach(async () => {
  await app?.close()
})

/**
 * Drive the route over a real socket — `app.inject()`'s mock response allows `writeHead`
 * to run again on a committed SSE stream, which a real socket forbids, so delegation to a
 * non-SSE-aware error handler behaves differently under inject.
 */
async function streamOverHttp(instance: FastifyInstance, url: string) {
  await instance.listen({ port: 0 })
  const { port } = instance.server.address() as AddressInfo
  const response = await fetch(`http://127.0.0.1:${port}${url}`)
  return { status: response.status, body: await response.text() }
}

describe('contract route error handling', () => {
  it('falls through to the app setErrorHandler when no resolver is configured', async () => {
    app = await buildApp()
    app.setErrorHandler((error: FastifyError, _request, reply) => {
      reply.status(599).send({ from: 'global', message: error.message })
    })
    app.route(
      buildFastifyApiRoute(jsonContract, () => {
        throw new Error('boom')
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users' })
    expect(response.statusCode).toBe(599)
    expect(response.json()).toEqual({ from: 'global', message: 'boom' })
  })

  it('resolves errors with the route-level resolveErrorResponse, bypassing setErrorHandler', async () => {
    const globalHandler = vi.fn()
    app = await buildApp()
    app.setErrorHandler(globalHandler)
    app.route(
      buildFastifyApiRoute(
        jsonContract,
        () => {
          throw new Error('boom')
        },
        { resolveErrorResponse: resolveToTeapot },
      ),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users' })
    expect(response.statusCode).toBe(418)
    expect(response.json()).toEqual({ mapped: 'boom' })
    expect(globalHandler).not.toHaveBeenCalled()
  })

  it('uses the resolver registered via the fastifyApiContracts plugin', async () => {
    app = await buildApp()
    await app.register(fastifyApiContracts, { resolveErrorResponse: resolveToTeapot })
    app.route(
      buildFastifyApiRoute(jsonContract, () => {
        throw new Error('boom')
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users' })
    expect(response.statusCode).toBe(418)
    expect(response.json()).toEqual({ mapped: 'boom' })
  })

  it('applies the headers the resolver returns to the error response', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(
        jsonContract,
        () => {
          throw new Error('slow down')
        },
        {
          resolveErrorResponse: () => ({
            statusCode: 429,
            payload: { error: 'rate limited' },
            headers: { 'retry-after': '30', 'x-error-id': 'err-1' },
          }),
        },
      ),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users' })
    expect(response.statusCode).toBe(429)
    expect(response.headers['retry-after']).toBe('30')
    expect(response.headers['x-error-id']).toBe('err-1')
    expect(response.json()).toEqual({ error: 'rate limited' })
  })

  it('prefers the route-level resolver over the plugin-registered one', async () => {
    app = await buildApp()
    await app.register(fastifyApiContracts, { resolveErrorResponse: resolveToTeapot })
    app.route(
      buildFastifyApiRoute(
        jsonContract,
        () => {
          throw new Error('boom')
        },
        { resolveErrorResponse: () => ({ statusCode: 400, payload: { mapped: 'route' } }) },
      ),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users' })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ mapped: 'route' })
  })

  it('does not accept a raw fastify errorHandler — resolveErrorResponse is the only hook', () => {
    const routeOptions = buildFastifyApiRoute(
      jsonContract,
      () => {
        throw new Error('boom')
      },
      {
        // @ts-expect-error — errorHandler is excluded from ApiRouteOptions: it would never
        // see mid-stream SSE errors and only half-replace the built-in behavior
        errorHandler: (_error: unknown, _request: unknown, reply: FastifyReply) => {
          void reply.status(503).send({ from: 'custom' })
        },
        resolveErrorResponse: resolveToTeapot,
      },
    )

    // The built-in handler is always attached regardless.
    expect(routeOptions.errorHandler).toBeInstanceOf(Function)
  })

  it('sends a terminal error event with the resolved payload and closes a live SSE stream', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(
        sseContract,
        async (_request, _reply, { sse }) => {
          const session = sse.start('autoClose')
          await session.send('update', { value: 1 })
          throw new Error('mid-stream boom')
        },
        { resolveErrorResponse: resolveToTeapot },
      ),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/stream' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('event: update')
    expect(response.body).toContain('event: error')
    expect(response.body).toContain('"mapped":"mid-stream boom"')
  })

  it('delegates a mid-stream error to an SSE-aware setErrorHandler when no resolver is configured', async () => {
    app = await buildApp()
    // A Polyglot-style SSE-aware global handler: emits its own terminal event.
    app.setErrorHandler(async (error: FastifyError, _request, reply) => {
      if (reply.sse?.isConnected) {
        await reply.sse.send({ event: 'error', data: { global: error.message } })
        reply.sse.close()
        return
      }
      await reply.status(500).send({ message: error.message })
    })
    app.route(
      buildFastifyApiRoute(sseContract, async (_request, _reply, { sse }) => {
        const session = sse.start('autoClose')
        await session.send('update', { value: 1 })
        throw new Error('mid-stream boom')
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/stream' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('event: update')
    expect(response.body).toContain('event: error')
    expect(response.body).toContain('"global":"mid-stream boom"')
  })

  it('still reports through a non-SSE-aware setErrorHandler and closes the stream', async () => {
    const reported: string[] = []
    app = await buildApp()
    // A typical handler that only knows reply.status().send() — it cannot deliver anything
    // on the committed stream, but its reporting side effects must still run.
    app.setErrorHandler((error: FastifyError, _request, reply) => {
      reported.push(error.message)
      reply.status(500).send({ message: error.message })
    })
    app.route(
      buildFastifyApiRoute(sseContract, async (_request, _reply, { sse }) => {
        const session = sse.start('autoClose')
        await session.send('update', { value: 1 })
        throw new Error('mid-stream boom')
      }),
    )

    const response = await streamOverHttp(app, '/stream')
    expect(response.status).toBe(200)
    expect(response.body).toContain('event: update')
    expect(response.body).not.toContain('event: error')
    expect(reported).toEqual(['mid-stream boom'])
  })

  it("closes a live SSE stream via Fastify's default handler when nothing is configured", async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(sseContract, async (_request, _reply, { sse }) => {
        const session = sse.start('autoClose')
        await session.send('update', { value: 1 })
        throw new Error('mid-stream boom')
      }),
    )

    const response = await streamOverHttp(app, '/stream')
    expect(response.status).toBe(200)
    expect(response.body).toContain('event: update')
    expect(response.body).not.toContain('event: error')
  })

  it('falls through to setErrorHandler when an SSE-capable route errors before the stream starts', async () => {
    app = await buildApp()
    app.setErrorHandler((error: FastifyError, _request, reply) => {
      reply.status(599).send({ from: 'global', message: error.message })
    })
    app.route(
      buildFastifyApiRoute(sseContract, () => {
        throw new Error('early boom')
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/stream' })
    expect(response.statusCode).toBe(599)
    expect(response.json()).toEqual({ from: 'global', message: 'early boom' })
  })
})

describe('apiRouteErrorHandler — live stream edge cases', () => {
  const boom = new Error('boom') as FastifyError
  const selections = [{ statusCode: '200', contentType: 'text/event-stream', events: {} }]

  it('still closes the stream when sending the terminal error event fails', async () => {
    const close = vi.fn()
    const reply = {
      sse: {
        isConnected: true,
        send: vi.fn().mockRejectedValue(new Error('gone')),
        close,
      },
    } as unknown as FastifyReply
    const request = { server: {} } as unknown as FastifyRequest
    // Attaches the SSE runtime to the reply, the way an SSE-capable request would have it.
    buildApiSSEContext(request, reply, selections, undefined)
    const errorHandler = buildApiRouteErrorHandler(resolveToTeapot)

    // The send failure propagates (the client is gone anyway), but the stream is closed.
    await expect(errorHandler(boom, request, reply)).rejects.toThrow('gone')
    expect(close).toHaveBeenCalled()
  })

  it('propagates a rejection from the delegated app error handler but still closes the stream', async () => {
    const close = vi.fn()
    const reply = { sse: { isConnected: true, close } } as unknown as FastifyReply
    const request = {
      server: { errorHandler: vi.fn().mockRejectedValue(new Error('handler boom')) },
    } as unknown as FastifyRequest
    buildApiSSEContext(request, reply, selections, undefined)
    const errorHandler = buildApiRouteErrorHandler(undefined)

    await expect(errorHandler(boom, request, reply)).rejects.toThrow('handler boom')
    expect(close).toHaveBeenCalled()
  })
})
