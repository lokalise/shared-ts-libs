import { Readable } from 'node:stream'
import * as fastifySSEImport from '@fastify/sse'
import {
  anyOfResponses,
  blobResponse,
  ContractNoBody,
  defineApiContract,
  sseResponse,
  textResponse,
} from '@lokalise/api-contracts'
import fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import { buildFastifyApiRoute } from './buildFastifyApiRoute.ts'

// ============================================================================
// Shared test fixtures
// ============================================================================

const userSchema = z.object({ id: z.string(), name: z.string() })

const getUserContract = defineApiContract({
  method: 'get',
  pathResolver: (p: { userId: string }) => `/users/${p.userId}`,
  requestPathParamsSchema: z.object({ userId: z.string() }),
  responsesByStatusCode: { 200: userSchema },
})

const createUserContract = defineApiContract({
  method: 'post',
  pathResolver: () => '/users',
  requestBodySchema: z.object({ name: z.string() }),
  responsesByStatusCode: { 201: userSchema },
})

const deleteUserContract = defineApiContract({
  method: 'delete',
  pathResolver: (p: { userId: string }) => `/users/${p.userId}`,
  requestPathParamsSchema: z.object({ userId: z.string() }),
  responsesByStatusCode: { 204: ContractNoBody },
})

const sseEventsSchema = {
  update: z.object({ value: z.number() }),
  done: z.object({ total: z.number() }),
}

const sseOnlyContract = defineApiContract({
  method: 'get',
  pathResolver: () => '/stream',
  responsesByStatusCode: { 200: sseResponse(sseEventsSchema) },
})

const dualModeContract = defineApiContract({
  method: 'post',
  pathResolver: () => '/chat',
  requestBodySchema: z.object({ message: z.string() }),
  responsesByStatusCode: {
    200: anyOfResponses([userSchema, sseResponse(sseEventsSchema)]),
  },
})

const fastifySSE = (fastifySSEImport as unknown as { default: FastifyPluginAsync }).default

async function buildApp(): Promise<FastifyInstance> {
  const app = fastify().withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(fastifySSE)
  return app
}

// ============================================================================
// buildFastifyApiRoute — non-SSE contracts
// ============================================================================

describe('buildFastifyApiRoute — non-SSE', () => {
  it('produces a GET route with correct method and url', () => {
    const routeOptions = buildFastifyApiRoute(getUserContract, async () => ({
      status: 200,
      body: { id: '1', name: 'Alice' },
    }))
    expect(routeOptions.method).toBe('get')
    expect(routeOptions.url).toBe('/users/:userId')
  })

  it('includes path params schema', () => {
    const routeOptions = buildFastifyApiRoute(getUserContract, async () => ({
      status: 200,
      body: { id: '1', name: 'Alice' },
    }))
    expect((routeOptions.schema as { params?: unknown })?.params).toBe(
      getUserContract.requestPathParamsSchema,
    )
  })

  it('produces a POST route with body schema', () => {
    const routeOptions = buildFastifyApiRoute(createUserContract, async () => ({
      status: 201,
      body: { id: '1', name: 'Alice' },
    }))
    expect(routeOptions.method).toBe('post')
    expect((routeOptions.schema as { body?: unknown })?.body).toBe(
      createUserContract.requestBodySchema,
    )
  })

  it('excludes body schema for ContractNoBody', () => {
    const routeOptions = buildFastifyApiRoute(deleteUserContract, async () => ({
      status: 204,
      body: null,
    }))
    expect((routeOptions.schema as { body?: unknown })?.body).toBeUndefined()
  })

  it('does not set sse property on non-SSE routes', () => {
    const routeOptions = buildFastifyApiRoute(getUserContract, async () => ({
      status: 200,
      body: { id: '1', name: 'Alice' },
    }))
    expect((routeOptions as { sse?: unknown }).sse).toBeUndefined()
  })

  it('attaches preHandler when provided in options', () => {
    const preHandler = vi.fn()
    const routeOptions = buildFastifyApiRoute(
      getUserContract,
      async () => ({ status: 200, body: { id: '1', name: 'Alice' } }),
      { preHandler },
    )
    expect(routeOptions.preHandler).toBe(preHandler)
  })

  it('applies contractMetadataToRouteMapper output to the route', () => {
    const config = { foo: 'bar' }
    const routeOptions = buildFastifyApiRoute(
      getUserContract,
      async () => ({ status: 200, body: { id: '1', name: 'Alice' } }),
      { contractMetadataToRouteMapper: () => ({ config }) },
    )
    expect((routeOptions as { config?: unknown }).config).toBe(config)
  })
})

// ============================================================================
// buildFastifyApiRoute — SSE-only contracts
// ============================================================================

describe('buildFastifyApiRoute — SSE-only', () => {
  it('produces a route with sse: true', () => {
    const routeOptions = buildFastifyApiRoute(sseOnlyContract, (_request, _reply, sse) => {
      sse.start('keepAlive')
    })
    expect((routeOptions as { sse?: unknown }).sse).toBe(true)
  })

  it('produces correct url', () => {
    const routeOptions = buildFastifyApiRoute(sseOnlyContract, (_request, _reply, sse) => {
      sse.start('keepAlive')
    })
    expect(routeOptions.url).toBe('/stream')
  })
})

// ============================================================================
// buildFastifyApiRoute — dual-mode contracts
// ============================================================================

describe('buildFastifyApiRoute — dual-mode', () => {
  it('produces a route with sse: true', () => {
    const routeOptions = buildFastifyApiRoute(dualModeContract, (_request, _reply, sse) => {
      sse.start('autoClose')
    })
    expect((routeOptions as { sse?: unknown }).sse).toBe(true)
  })

  it('produces correct url and method', () => {
    const routeOptions = buildFastifyApiRoute(dualModeContract, (_request, _reply, sse) => {
      sse.start('autoClose')
    })
    expect(routeOptions.method).toBe('post')
    expect(routeOptions.url).toBe('/chat')
  })

  it('includes body schema', () => {
    const routeOptions = buildFastifyApiRoute(dualModeContract, (_request, _reply, sse) => {
      sse.start('autoClose')
    })
    expect((routeOptions.schema as { body?: unknown })?.body).toBe(
      dualModeContract.requestBodySchema,
    )
  })
})

// ============================================================================
// buildFastifyApiRoute — custom SSE config options
// ============================================================================

describe('buildFastifyApiRoute — SSE config via options', () => {
  it('passes custom serializer into sse config', () => {
    const serializer = (data: unknown) => JSON.stringify(data)
    const routeOptions = buildFastifyApiRoute(
      sseOnlyContract,
      (_r, _reply, sse) => {
        sse.start('keepAlive')
      },
      { serializer },
    )
    expect((routeOptions as { sse?: unknown }).sse).toEqual({ serializer })
  })

  it('passes heartbeatInterval into sse config', () => {
    const routeOptions = buildFastifyApiRoute(
      sseOnlyContract,
      (_r, _reply, sse) => {
        sse.start('keepAlive')
      },
      { heartbeatInterval: 10000 },
    )
    expect((routeOptions as { sse?: unknown }).sse).toEqual({ heartbeatInterval: 10000 })
  })
})

// ============================================================================
// buildFastifyApiRoute — response schemas
// ============================================================================

describe('buildFastifyApiRoute — response schemas', () => {
  it('includes JSON response schema for a GET route', () => {
    const routeOptions = buildFastifyApiRoute(getUserContract, async () => ({
      status: 200,
      body: { id: '1', name: 'Alice' },
    }))
    expect(routeOptions).toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({ response: { 200: userSchema } }),
      }),
    )
  })

  it('includes JSON response schema for a POST route', () => {
    const routeOptions = buildFastifyApiRoute(createUserContract, async () => ({
      status: 201,
      body: { id: '1', name: 'Alice' },
    }))
    expect(routeOptions).toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({ response: { 201: userSchema } }),
      }),
    )
  })

  it('omits ContractNoBody status codes from response schemas', () => {
    const routeOptions = buildFastifyApiRoute(deleteUserContract, async () => ({
      status: 204,
      body: null,
    }))
    expect(routeOptions).toEqual(
      expect.objectContaining({ schema: expect.objectContaining({ response: {} }) }),
    )
  })

  it('omits SSE-only status codes from response schemas', () => {
    const routeOptions = buildFastifyApiRoute(sseOnlyContract, (_request, _reply, sse) => {
      sse.start('keepAlive')
    })
    expect(routeOptions).toEqual(
      expect.objectContaining({ schema: expect.objectContaining({ response: {} }) }),
    )
  })

  it('picks the JSON schema from anyOfResponses even when SSE variant comes first', () => {
    const sseFirstContract = defineApiContract({
      method: 'get',
      pathResolver: () => '/mixed',
      responsesByStatusCode: {
        200: anyOfResponses([sseResponse(sseEventsSchema), userSchema]),
      },
    })
    const routeOptions = buildFastifyApiRoute(sseFirstContract, (_request, _reply, sse) => {
      sse.start('keepAlive')
    })
    expect(routeOptions).toEqual(
      expect.objectContaining({
        schema: expect.objectContaining({ response: { 200: userSchema } }),
      }),
    )
  })
})

// ============================================================================
// buildFastifyApiRoute — no-path-params contract
// ============================================================================

describe('buildFastifyApiRoute — no path params', () => {
  it('produces correct url for contract without path params', () => {
    const routeOptions = buildFastifyApiRoute(createUserContract, async () => ({
      status: 201,
      body: { id: '1', name: 'Alice' },
    }))
    expect(routeOptions.url).toBe('/users')
    expect((routeOptions.schema as { params?: unknown })?.params).toBeUndefined()
  })
})

// ============================================================================
// buildFastifyApiRoute — runtime behavior (Fastify inject)
// ============================================================================

describe('buildFastifyApiRoute — runtime', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('sends the status and body returned by a non-SSE handler', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(getUserContract, async (request) => ({
        status: 200,
        body: { id: request.params.userId, name: 'Alice' },
      })),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users/42' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ id: '42', name: 'Alice' })
  })

  it('sends an empty 204 for a no-body response returned as { status, body: null }', async () => {
    app = await buildApp()
    app.route(buildFastifyApiRoute(deleteUserContract, async () => ({ status: 204, body: null })))
    await app.ready()

    const response = await app.inject({ method: 'DELETE', url: '/users/42' })
    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
  })

  it('returns 500 when the handler body fails contract validation', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/profile',
      responsesByStatusCode: { 200: z.object({ id: z.string() }) },
    })
    // Intentionally invalid body (id is a number) to trigger response validation failure.
    const invalidBody = { id: 123 } as unknown as { id: string }
    app = await buildApp()
    app.route(buildFastifyApiRoute(contract, async () => ({ status: 200, body: invalidBody })))
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/profile' })
    expect(response.statusCode).toBe(500)
  })

  it('supports multiple status codes from a single handler', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: (p: { id: string }) => `/users/${p.id}`,
      requestPathParamsSchema: z.object({ id: z.string() }),
      responsesByStatusCode: {
        200: userSchema,
        404: z.object({ error: z.string() }),
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (request) => {
        if (request.params.id === 'missing') {
          return { status: 404, body: { error: 'Not found' } }
        }
        return { status: 200, body: { id: request.params.id, name: 'Alice' } }
      }),
    )
    await app.ready()

    const found = await app.inject({ method: 'GET', url: '/users/1' })
    expect(found.statusCode).toBe(200)

    const missing = await app.inject({ method: 'GET', url: '/users/missing' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'Not found' })
  })

  it('sends a string body with the contract-declared text content-type', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/export.csv',
      responsesByStatusCode: { 200: textResponse('text/csv') },
    })
    app = await buildApp()
    app.route(buildFastifyApiRoute(contract, () => ({ status: 200, body: 'a,b\n1,2' })))
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/export.csv' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.body).toBe('a,b\n1,2')
  })

  it('selects the content-type by the returned body kind for a mixed anyOf response', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: (p: { format: string }) => `/export/${p.format}`,
      requestPathParamsSchema: z.object({ format: z.string() }),
      responsesByStatusCode: {
        200: anyOfResponses([z.object({ rows: z.number() }), textResponse('text/csv')]),
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (request) =>
        request.params.format === 'csv'
          ? { status: 200, body: 'a,b\n1,2' }
          : { status: 200, body: { rows: 1 } },
      ),
    )
    await app.ready()

    // Object body → JSON, even though the same status also declares a text variant.
    const json = await app.inject({ method: 'GET', url: '/export/json' })
    expect(json.statusCode).toBe(200)
    expect(json.headers['content-type']).toContain('application/json')
    expect(json.json()).toEqual({ rows: 1 })

    // String body → the declared text content-type.
    const csv = await app.inject({ method: 'GET', url: '/export/csv' })
    expect(csv.statusCode).toBe(200)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.body).toBe('a,b\n1,2')
  })

  it('streams a text response (e.g. text/html) via a Readable', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/page',
      responsesByStatusCode: { 200: textResponse('text/html') },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, () => ({
        status: 200,
        body: Readable.from(['<html>', '<body>hi</body>', '</html>']),
      })),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/page' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toBe('<html><body>hi</body></html>')
  })

  it('sends a Buffer body with the contract-declared blob content-type', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/report.pdf',
      responsesByStatusCode: { 200: blobResponse('application/pdf') },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, () => ({
        status: 200,
        body: Buffer.from('%PDF-1.4 data'),
      })),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/report.pdf' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.body).toBe('%PDF-1.4 data')
  })

  it('pipes a Readable stream body with the contract-declared blob content-type', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/report.pdf',
      responsesByStatusCode: { 200: blobResponse('application/pdf') },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, () => ({
        status: 200,
        body: Readable.from(['%PDF-1.4 ', 'streamed']),
      })),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/report.pdf' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    expect(response.body).toBe('%PDF-1.4 streamed')
  })

  it('streams events from an SSE-only autoClose handler', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(sseOnlyContract, async (_request, _reply, sse) => {
        const session = sse.start('autoClose')
        await session.send('update', { value: 1 })
        await session.send('done', { total: 1 })
      }),
    )
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/stream',
      headers: { accept: 'text/event-stream' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('event: update')
    expect(response.body).toContain('event: done')
  })

  it('streams events from an async-iterable body', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(sseOnlyContract, (_request, _reply, _sse) => ({
        status: 200,
        // biome-ignore lint/suspicious/useAwait: async is required to satisfy AsyncIterable
        body: (async function* () {
          yield { event: 'update', data: { value: 1 } } as const
          yield { event: 'done', data: { total: 1 } } as const
        })(),
      })),
    )
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/stream',
      headers: { accept: 'text/event-stream' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('event: update')
    expect(response.body).toContain('event: done')
  })

  it("reports 'server' as the close initiator when an autoClose stream completes", async () => {
    let closeInitiator: string | undefined
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(
        sseOnlyContract,
        async (_request, _reply, sse) => {
          const session = sse.start('autoClose')
          await session.send('done', { total: 1 })
        },
        {
          onClose: (_session, initiator) => {
            closeInitiator = initiator
          },
        },
      ),
    )
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/stream',
      headers: { accept: 'text/event-stream' },
    })
    expect(response.statusCode).toBe(200)
    await vi.waitFor(() => expect(closeInitiator).toBe('server'))
  })

  it('shares a 404 then streams via async iterable for an SSE-capable contract', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: (p: { id: string }) => `/items/${p.id}`,
      requestPathParamsSchema: z.object({ id: z.string() }),
      responsesByStatusCode: {
        200: sseResponse(sseEventsSchema),
        404: z.object({ error: z.string() }),
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (request, _reply, _sse) => {
        if (request.params.id === 'missing') {
          return { status: 404, body: { error: 'Not found' } }
        }
        return {
          status: 200,
          // biome-ignore lint/suspicious/useAwait: async is required to satisfy AsyncIterable
          body: (async function* () {
            yield { event: 'done', data: { total: 1 } } as const
          })(),
        }
      }),
    )
    await app.ready()

    const missing = await app.inject({ method: 'GET', url: '/items/missing' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'Not found' })

    const stream = await app.inject({
      method: 'GET',
      url: '/items/1',
      headers: { accept: 'text/event-stream' },
    })
    expect(stream.statusCode).toBe(200)
    expect(stream.body).toContain('event: done')
  })

  it('returns an early { status, body } HTTP response instead of streaming', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: sseResponse(sseEventsSchema),
        503: z.object({ error: z.string() }),
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (_request, _reply, _sse) => ({
        status: 503,
        body: { error: 'unavailable' },
      })),
    )
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/stream',
      headers: { accept: 'text/event-stream' },
    })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ error: 'unavailable' })
  })

  it('lets a single dual-mode handler return JSON when the client wants JSON', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(dualModeContract, async (request, _reply, sse) => {
        if (request.headers.accept === 'text/event-stream') {
          const session = sse.start('autoClose')
          await session.send('done', { total: 0 })
          return
        }
        return { status: 200, body: { id: '1', name: request.body.message } }
      }),
    )
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { accept: 'application/json' },
      payload: { message: 'hi' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ id: '1', name: 'hi' })
  })

  it('lets a single dual-mode handler stream when the client wants SSE', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(dualModeContract, async (request, _reply, sse) => {
        if (request.headers.accept === 'text/event-stream') {
          const session = sse.start('autoClose')
          await session.send('done', { total: 7 })
          return
        }
        return { status: 200, body: { id: '1', name: 'sync' } }
      }),
    )
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { accept: 'text/event-stream' },
      payload: { message: 'hi' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('event: done')
  })

  it('shares logic across both representations before branching', async () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: (p: { id: string }) => `/items/${p.id}`,
      requestPathParamsSchema: z.object({ id: z.string() }),
      responsesByStatusCode: {
        200: anyOfResponses([userSchema, sseResponse(sseEventsSchema)]),
        404: z.object({ error: z.string() }),
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, async (request, _reply, sse) => {
        // Shared lookup runs once for both the JSON and SSE representations.
        if (request.params.id === 'missing') {
          return { status: 404, body: { error: 'Not found' } }
        }
        if (request.headers.accept === 'text/event-stream') {
          const session = sse.start('autoClose')
          await session.send('done', { total: 1 })
          return
        }
        return { status: 200, body: { id: request.params.id, name: 'Alice' } }
      }),
    )
    await app.ready()

    const missing = await app.inject({ method: 'GET', url: '/items/missing' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'Not found' })

    const json = await app.inject({ method: 'GET', url: '/items/1' })
    expect(json.statusCode).toBe(200)
    expect(json.json()).toEqual({ id: '1', name: 'Alice' })

    const stream = await app.inject({
      method: 'GET',
      url: '/items/1',
      headers: { accept: 'text/event-stream' },
    })
    expect(stream.statusCode).toBe(200)
    expect(stream.body).toContain('event: done')
  })
})
