import { Readable } from 'node:stream'
import * as fastifySSEImport from '@fastify/sse'
import {
  blobBody,
  ContractNoBody,
  defineApiContract,
  type InferSseSuccessResponses,
  noBodyResponse,
  sseBody,
} from '@lokalise/api-contracts'
import fastify, { type FastifyInstance, type FastifyPluginAsync, type RouteOptions } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod/v4'
import type {
  ApiHandlerContext,
  InferApiHandler,
  InferApiHandlerRequest,
  InferApiHandlerResult,
} from './apiHandlerTypes.ts'
import { buildFastifyApiRoute, hasAnySseResponse } from './buildFastifyApiRoute.ts'
import { buildFastifyApiSchema } from './buildFastifyApiSchema.ts'
import type { SSEContext, SSEStreamMessage } from './sseTypes.ts'

// ============================================================================
// Shared test fixtures
// ============================================================================

const userSchema = z.object({ id: z.string(), name: z.string() })

const getUserContract = defineApiContract({
  method: 'get',
  summary: 'Get a user',
  pathResolver: (p: { userId: string }) => `/users/${p.userId}`,
  requestPathParamsSchema: z.object({ userId: z.string() }),
  responsesByStatusCode: { 200: userSchema },
})

const createUserContract = defineApiContract({
  method: 'post',
  summary: 'Create a user',
  pathResolver: () => '/users',
  requestBodySchema: z.object({ name: z.string() }),
  responsesByStatusCode: { 201: userSchema },
})

const deleteUserContract = defineApiContract({
  method: 'delete',
  summary: 'Delete a user',
  pathResolver: (p: { userId: string }) => `/users/${p.userId}`,
  requestPathParamsSchema: z.object({ userId: z.string() }),
  responsesByStatusCode: { 204: noBodyResponse() },
})

const sseEventsSchema = {
  update: z.object({ value: z.number() }),
  done: z.object({ total: z.number() }),
}

const sseOnlyContract = defineApiContract({
  method: 'get',
  summary: 'Stream updates',
  pathResolver: () => '/stream',
  responsesByStatusCode: { 200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } } },
})

const dualModeContract = defineApiContract({
  method: 'post',
  summary: 'Chat',
  pathResolver: () => '/chat',
  requestBodySchema: z.object({ message: z.string() }),
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': userSchema,
        'text/event-stream': sseBody(sseEventsSchema),
      },
    },
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

  it('derives the route schema from the contract', () => {
    const routeOptions = buildFastifyApiRoute(createUserContract, async () => ({
      status: 201,
      body: { id: '1', name: 'Alice' },
    }))
    expect(routeOptions.method).toBe('post')
    // Request/response schema mapping itself is covered by buildFastifyApiSchema.spec.ts.
    expect(routeOptions.schema).toEqual(buildFastifyApiSchema(createUserContract))
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
    expect(routeOptions.config).toEqual({ foo: 'bar', apiContract: getUserContract })
  })

  it('exposes the contract as config.apiContract', () => {
    const routeOptions = buildFastifyApiRoute(getUserContract, async () => ({
      status: 200,
      body: { id: '1', name: 'Alice' },
    }))
    expect(routeOptions.config?.apiContract).toBe(getUserContract)
  })

  it('lets explicitly passed options override contractMetadataToRouteMapper output', () => {
    const routeOptions = buildFastifyApiRoute(
      getUserContract,
      async () => ({ status: 200, body: { id: '1', name: 'Alice' } }),
      {
        bodyLimit: 2048,
        contractMetadataToRouteMapper: () => ({ bodyLimit: 1024 }),
      },
    )
    expect(routeOptions.bodyLimit).toBe(2048)
  })

  it('merges an explicitly passed config with mapper config, explicit keys winning', () => {
    const explicitConfig = { shared: 'explicit' } as unknown as NonNullable<RouteOptions['config']>
    const routeOptions = buildFastifyApiRoute(
      getUserContract,
      async () => ({ status: 200, body: { id: '1', name: 'Alice' } }),
      {
        config: explicitConfig,
        contractMetadataToRouteMapper: () => ({ config: { foo: 'mapper', shared: 'mapper' } }),
      },
    )
    expect(routeOptions.config).toEqual({
      foo: 'mapper',
      shared: 'explicit',
      apiContract: getUserContract,
    })
  })
})

// ============================================================================
// buildFastifyApiRoute — SSE-only contracts
// ============================================================================

describe('buildFastifyApiRoute — SSE-only', () => {
  it("produces a route with sse kind 'manual'", () => {
    const routeOptions = buildFastifyApiRoute(sseOnlyContract, (_request, _reply, { sse }) => {
      sse.start('keepAlive')
    })
    expect((routeOptions as { sse?: unknown }).sse).toEqual({ kind: 'manual' })
  })

  it('produces correct url', () => {
    const routeOptions = buildFastifyApiRoute(sseOnlyContract, (_request, _reply, { sse }) => {
      sse.start('keepAlive')
    })
    expect(routeOptions.url).toBe('/stream')
  })
})

// ============================================================================
// buildFastifyApiRoute — dual-mode contracts
// ============================================================================

describe('buildFastifyApiRoute — dual-mode', () => {
  it("produces a route with sse kind 'manual'", () => {
    const routeOptions = buildFastifyApiRoute(dualModeContract, (_request, _reply, { sse }) => {
      sse.start('autoClose')
    })
    expect((routeOptions as { sse?: unknown }).sse).toEqual({ kind: 'manual' })
  })

  it('produces correct url and method', () => {
    const routeOptions = buildFastifyApiRoute(dualModeContract, (_request, _reply, { sse }) => {
      sse.start('autoClose')
    })
    expect(routeOptions.method).toBe('post')
    expect(routeOptions.url).toBe('/chat')
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
      (_r, _reply, { sse }) => {
        sse.start('keepAlive')
      },
      { serializer },
    )
    expect((routeOptions as { sse?: unknown }).sse).toEqual({ kind: 'manual', serializer })
  })

  it('passes heartbeat: false into sse config', () => {
    const routeOptions = buildFastifyApiRoute(
      sseOnlyContract,
      (_r, _reply, { sse }) => {
        sse.start('keepAlive')
      },
      { heartbeat: false },
    )
    expect((routeOptions as { sse?: unknown }).sse).toEqual({ kind: 'manual', heartbeat: false })
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
  })
})

// ============================================================================
// hasAnySseResponse
// ============================================================================

describe('hasAnySseResponse', () => {
  it('returns true for an sseBody at a success code', () => {
    expect(hasAnySseResponse(sseOnlyContract)).toBe(true)
  })

  it('returns true for an sseBody at any status code', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Stream errors',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: z.object({ id: z.string() }),
        404: { content: { 'text/event-stream': sseBody({ error: z.string() }) } },
      },
    })

    expect(hasAnySseResponse(contract)).toBe(true)
  })

  it('returns false when no SSE response is present', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Get a user',
      pathResolver: () => '/users',
      responsesByStatusCode: {
        200: userSchema,
        204: noBodyResponse(),
        404: { content: { 'text/csv': blobBody() } },
      },
    })

    expect(hasAnySseResponse(contract)).toBe(false)
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
      summary: 'Get profile',
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

  it('returns 500 when the handler returns an undeclared status code', async () => {
    app = await buildApp()
    const handler = (() => ({
      status: 418,
      body: { id: '1', name: 'A' },
    })) as unknown as InferApiHandler<typeof getUserContract>
    app.route(buildFastifyApiRoute(getUserContract, handler))
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users/1' })
    expect(response.statusCode).toBe(500)
  })

  it('returns 500 when the handler returns an undeclared contentType', async () => {
    app = await buildApp()
    const handler = (() => ({
      status: 200,
      contentType: 'text/plain',
      body: { id: '1', name: 'A' },
    })) as unknown as InferApiHandler<typeof dualModeContract>
    app.route(buildFastifyApiRoute(dualModeContract, handler))
    await app.ready()

    const response = await app.inject({ method: 'POST', url: '/chat', payload: { message: 'hi' } })
    expect(response.statusCode).toBe(500)
  })

  it('returns 500 when an explicit contentType targets a bare-Zod (JSON) response entry', async () => {
    app = await buildApp()
    const handler = (() => ({
      status: 200,
      contentType: 'text/plain',
      body: { id: '1', name: 'A' },
    })) as unknown as InferApiHandler<typeof getUserContract>
    app.route(buildFastifyApiRoute(getUserContract, handler))
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users/1' })
    expect(response.statusCode).toBe(500)
  })

  it('returns 500 when an explicit contentType targets a no-body response entry', async () => {
    app = await buildApp()
    const handler = (() => ({
      status: 204,
      contentType: 'text/plain',
      body: null,
    })) as unknown as InferApiHandler<typeof deleteUserContract>
    app.route(buildFastifyApiRoute(deleteUserContract, handler))
    await app.ready()

    const response = await app.inject({ method: 'DELETE', url: '/users/1' })
    expect(response.statusCode).toBe(500)
  })

  it('returns 500 when the handler returns a non-null body for a no-body response entry', async () => {
    app = await buildApp()
    const handler = (() => ({
      status: 204,
      body: 'unexpected',
    })) as unknown as InferApiHandler<typeof deleteUserContract>
    app.route(buildFastifyApiRoute(deleteUserContract, handler))
    await app.ready()

    const response = await app.inject({ method: 'DELETE', url: '/users/1' })
    expect(response.statusCode).toBe(500)
  })

  it('returns 500 when a status declares no content-type and the handler returns a body', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Empty content map',
      pathResolver: () => '/empty',
      responsesByStatusCode: { 200: { content: {} } },
    })
    app = await buildApp()
    const handler = (() => ({
      status: 200,
      body: 'x',
    })) as unknown as InferApiHandler<typeof contract>
    app.route(buildFastifyApiRoute(contract, handler))
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/empty' })
    expect(response.statusCode).toBe(500)
  })

  it('sends the response when the reply headers match the responseHeaderSchema', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Get a user',
      pathResolver: () => '/users',
      responseHeaderSchema: z.object({ 'x-request-id': z.string() }),
      responsesByStatusCode: { 200: userSchema },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (_request, reply) => {
        reply.header('x-request-id', 'req-1')
        return { status: 200, body: { id: '1', name: 'Alice' } }
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['x-request-id']).toBe('req-1')
  })

  it('returns 500 when the reply headers fail the responseHeaderSchema', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Get a user',
      pathResolver: () => '/users',
      responseHeaderSchema: z.object({ 'x-request-id': z.string() }),
      responsesByStatusCode: { 200: userSchema },
    })
    app = await buildApp()
    // The handler never sets x-request-id, so header validation fails.
    app.route(
      buildFastifyApiRoute(contract, async () => ({ status: 200, body: { id: '1', name: 'A' } })),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users' })
    expect(response.statusCode).toBe(500)
  })

  it('returns 500 instead of starting an SSE stream when the reply headers fail the responseHeaderSchema', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Stream updates',
      pathResolver: () => '/stream',
      responseHeaderSchema: z.object({ 'x-request-id': z.string() }),
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
      },
    })
    app = await buildApp()
    // The handler never sets x-request-id — validation must fail at sse.start(), before
    // the stream headers are flushed, so the client gets a clean 500.
    app.route(
      buildFastifyApiRoute(contract, async (_request, _reply, { sse }) => {
        const session = sse.start('autoClose')
        await session.send('done', { total: 1 })
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/stream' })
    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('event: done')
  })

  it('streams when the reply headers satisfy the responseHeaderSchema at SSE start', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Stream updates',
      pathResolver: () => '/stream',
      responseHeaderSchema: z.object({ 'x-request-id': z.string() }),
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, async (_request, reply, { sse }) => {
        reply.header('x-request-id', 'req-1')
        const session = sse.start('autoClose')
        await session.send('done', { total: 1 })
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/stream' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('event: done')
  })

  it('does not send a second response when the handler already replied via reply.hijack()', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(getUserContract, (_request, reply) => {
        reply.hijack()
        reply.raw.setHeader('content-type', 'application/json')
        reply.raw.end(JSON.stringify({ id: 'direct', name: 'Direct' }))
        return { status: 200, body: { id: 'ignored', name: 'Ignored' } }
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users/1' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ id: 'direct', name: 'Direct' })
  })

  it('skips response-header validation when the handler already replied via reply.hijack()', async () => {
    const logs: string[] = []
    app = fastify({
      logger: { level: 'error', stream: { write: (line: string) => void logs.push(line) } },
    }).withTypeProvider<ZodTypeProvider>()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)

    const contract = defineApiContract({
      method: 'get',
      summary: 'Get a user',
      pathResolver: () => '/users',
      // The hijacked raw response never sets x-request-id — validating it after the
      // response went out would throw into Fastify's error handler for nothing.
      responseHeaderSchema: z.object({ 'x-request-id': z.string() }),
      responsesByStatusCode: { 200: userSchema },
    })
    app.route(
      buildFastifyApiRoute(contract, (_request, reply) => {
        reply.hijack()
        reply.raw.setHeader('content-type', 'application/json')
        reply.raw.end(JSON.stringify({ id: 'direct', name: 'Direct' }))
        return { status: 200, body: { id: 'ignored', name: 'Ignored' } }
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/users' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ id: 'direct', name: 'Direct' })
    expect(logs.filter((line) => line.includes('RESPONSE_HEADERS_VALIDATION_FAILED'))).toEqual([])
  })

  it('returns 500 when an SSE-capable handler neither returns a result nor starts a stream', async () => {
    app = await buildApp()
    const handler = (() => undefined) as unknown as InferApiHandler<typeof sseOnlyContract>
    app.route(buildFastifyApiRoute(sseOnlyContract, handler))
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/stream' })
    expect(response.statusCode).toBe(500)
  })

  it('supports multiple status codes from a single handler', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Get a user',
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

  it('sends a string body with the contract-declared blob content-type', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Export CSV',
      pathResolver: () => '/export.csv',
      responsesByStatusCode: { 200: { content: { 'text/csv': blobBody() } } },
    })
    app = await buildApp()
    app.route(buildFastifyApiRoute(contract, () => ({ status: 200, body: 'a,b\n1,2' })))
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/export.csv' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.body).toBe('a,b\n1,2')
  })

  it('sends the explicit contentType returned for a mixed content-map response', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Export in a chosen format',
      pathResolver: (p: { format: string }) => `/export/${p.format}`,
      requestPathParamsSchema: z.object({ format: z.string() }),
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': z.object({ rows: z.number() }),
            'text/csv': blobBody(),
          },
        },
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (request) =>
        request.params.format === 'csv'
          ? { status: 200, contentType: 'text/csv', body: 'a,b\n1,2' }
          : { status: 200, contentType: 'application/json', body: { rows: 1 } },
      ),
    )
    await app.ready()

    const json = await app.inject({ method: 'GET', url: '/export/json' })
    expect(json.statusCode).toBe(200)
    expect(json.headers['content-type']).toContain('application/json')
    expect(json.json()).toEqual({ rows: 1 })

    const csv = await app.inject({ method: 'GET', url: '/export/csv' })
    expect(csv.statusCode).toBe(200)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.body).toBe('a,b\n1,2')
  })

  it('disambiguates two JSON variants at one status by the explicit contentType', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Get a report',
      pathResolver: (p: { variant: string }) => `/report/${p.variant}`,
      requestPathParamsSchema: z.object({ variant: z.string() }),
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': z.object({ rows: z.number() }),
            'application/vnd.report+json': z.object({ report: z.string() }),
          },
        },
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (request) =>
        request.params.variant === 'plain'
          ? { status: 200, contentType: 'application/json', body: { rows: 1 } }
          : { status: 200, contentType: 'application/vnd.report+json', body: { report: 'ok' } },
      ),
    )
    await app.ready()

    // Both bodies are objects — only the explicit contentType can tell the variants apart.
    const plain = await app.inject({ method: 'GET', url: '/report/plain' })
    expect(plain.statusCode).toBe(200)
    expect(plain.headers['content-type']).toContain('application/json')
    expect(plain.json()).toEqual({ rows: 1 })

    const vnd = await app.inject({ method: 'GET', url: '/report/vnd' })
    expect(vnd.statusCode).toBe(200)
    expect(vnd.headers['content-type']).toContain('application/vnd.report+json')
    expect(vnd.json()).toEqual({ report: 'ok' })
  })

  it('streams a text/html blob response via a Readable', async () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Render page',
      pathResolver: () => '/page',
      responsesByStatusCode: { 200: { content: { 'text/html': blobBody() } } },
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
      summary: 'Download report',
      pathResolver: () => '/report.pdf',
      responsesByStatusCode: { 200: { content: { 'application/pdf': blobBody() } } },
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
      summary: 'Download report',
      pathResolver: () => '/report.pdf',
      responsesByStatusCode: { 200: { content: { 'application/pdf': blobBody() } } },
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
      buildFastifyApiRoute(sseOnlyContract, async (_request, _reply, { sse }) => {
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

  it('streams without an Accept header — manual mode skips Accept negotiation', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(sseOnlyContract, async (_request, _reply, { sse }) => {
        const session = sse.start('autoClose')
        await session.send('done', { total: 1 })
      }),
    )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/stream' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.body).toContain('event: done')
  })

  it('streams events from an async-iterable body', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(sseOnlyContract, (_request, _reply) => ({
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
        async (_request, _reply, { sse }) => {
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
      summary: 'Stream item updates',
      pathResolver: (p: { id: string }) => `/items/${p.id}`,
      requestPathParamsSchema: z.object({ id: z.string() }),
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
        404: z.object({ error: z.string() }),
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (request, _reply) => {
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
      summary: 'Stream updates',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
        503: z.object({ error: z.string() }),
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, (_request, _reply) => ({
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

  it('streams an async-iterable body returned with an explicit text/event-stream contentType', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(dualModeContract, (_request, _reply) => ({
        status: 200,
        contentType: 'text/event-stream',
        // biome-ignore lint/suspicious/useAwait: async is required to satisfy AsyncIterable
        body: (async function* () {
          yield { event: 'done', data: { total: 3 } } as const
        })(),
      })),
    )
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { accept: 'text/event-stream' },
      payload: { message: 'hi' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.body).toContain('event: done')
  })

  it('negotiates the representation via context.expectedContentType', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(
        dualModeContract,
        async (_request, _reply, { expectedContentType, sse }) => {
          if (expectedContentType === 'text/event-stream') {
            const session = sse.start('autoClose')
            await session.send('done', { total: 5 })
            return
          }
          return { status: 200, contentType: 'application/json', body: { id: '1', name: 'neg' } }
        },
      ),
    )
    await app.ready()

    const stream = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { accept: 'text/event-stream' },
      payload: { message: 'hi' },
    })
    expect(stream.statusCode).toBe(200)
    expect(stream.body).toContain('event: done')

    const json = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { accept: 'application/json' },
      payload: { message: 'hi' },
    })
    expect(json.statusCode).toBe(200)
    expect(json.json()).toEqual({ id: '1', name: 'neg' })
  })

  it('lets a single dual-mode handler return JSON when the client wants JSON', async () => {
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(dualModeContract, async (request, _reply, { sse }) => {
        if (request.headers.accept === 'text/event-stream') {
          const session = sse.start('autoClose')
          await session.send('done', { total: 0 })
          return
        }
        return {
          status: 200,
          contentType: 'application/json',
          body: { id: '1', name: request.body.message },
        }
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
      buildFastifyApiRoute(dualModeContract, async (request, _reply, { sse }) => {
        if (request.headers.accept === 'text/event-stream') {
          const session = sse.start('autoClose')
          await session.send('done', { total: 7 })
          return
        }
        return { status: 200, contentType: 'application/json', body: { id: '1', name: 'sync' } }
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
      summary: 'Get an item as JSON or a stream',
      pathResolver: (p: { id: string }) => `/items/${p.id}`,
      requestPathParamsSchema: z.object({ id: z.string() }),
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': userSchema,
            'text/event-stream': sseBody(sseEventsSchema),
          },
        },
        404: z.object({ error: z.string() }),
      },
    })
    app = await buildApp()
    app.route(
      buildFastifyApiRoute(contract, async (request, _reply, { sse }) => {
        // Shared lookup runs once for both the JSON and SSE representations.
        if (request.params.id === 'missing') {
          return { status: 404, body: { error: 'Not found' } }
        }
        if (request.headers.accept === 'text/event-stream') {
          const session = sse.start('autoClose')
          await session.send('done', { total: 1 })
          return
        }
        return {
          status: 200,
          contentType: 'application/json',
          body: { id: request.params.id, name: 'Alice' },
        }
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

// ============================================================================
// InferApiHandlerRequest (type-level)
// ============================================================================

describe('InferApiHandlerRequest', () => {
  it('infers path params, query and headers for a GET contract', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Get a user',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      requestQuerySchema: z.object({ limit: z.number() }),
      requestHeaderSchema: z.object({ authorization: z.string() }),
      pathResolver: (p) => `/users/${p.userId}`,
      responsesByStatusCode: { 200: userSchema },
    })

    type Request = InferApiHandlerRequest<typeof contract>
    expectTypeOf<Request['params']>().toEqualTypeOf<{ userId: string }>()
    expectTypeOf<Request['query']>().toEqualTypeOf<{ limit: number }>()
    expectTypeOf<Request['headers']>().toHaveProperty('authorization')
  })

  it('infers the body for a POST contract', () => {
    type Request = InferApiHandlerRequest<typeof createUserContract>
    expectTypeOf<Request['body']>().toEqualTypeOf<{ name: string }>()
  })

  it('infers an undefined body for a ContractNoBody payload contract', () => {
    const contract = defineApiContract({
      method: 'post',
      summary: 'Ping',
      requestBodySchema: ContractNoBody,
      pathResolver: () => '/ping',
      responsesByStatusCode: { 204: noBodyResponse() },
    })

    // The route-level Body generic is `undefined`; Fastify surfaces an absent body
    // as `unknown` on `req.body` at the handler level.
    type Request = InferApiHandlerRequest<typeof contract>
    expectTypeOf<Request['body']>().toEqualTypeOf<unknown>()
  })
})

// ============================================================================
// InferApiHandlerResult (type-level)
// ============================================================================

describe('InferApiHandlerResult', () => {
  it('builds a discriminated union of { status, body } pairs over JSON responses', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'List users',
      pathResolver: () => '/users',
      responsesByStatusCode: {
        200: userSchema,
        404: z.object({ error: z.string() }),
      },
    })

    type Response = InferApiHandlerResult<typeof contract>
    expectTypeOf<Response>().toEqualTypeOf<
      { status: 200; body: { id: string; name: string } } | { status: 404; body: { error: string } }
    >()
  })

  it('infers an async-iterable body for an SSE response', () => {
    // An SSE response surfaces as a { status, body } whose body streams the contract events;
    // with a single declared media type the contentType is optional.
    expectTypeOf<InferApiHandlerResult<typeof sseOnlyContract>>().toEqualTypeOf<{
      status: 200
      contentType?: 'text/event-stream'
      body: AsyncIterable<
        SSEStreamMessage<
          InferSseSuccessResponses<(typeof sseOnlyContract)['responsesByStatusCode']>
        >
      >
    }>()
  })

  it('requires a contentType discriminating the body when a status declares several media types', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Export in a chosen format',
      pathResolver: () => '/export',
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': z.object({ rows: z.number() }),
            'application/vnd.report+json': z.object({ report: z.string() }),
          },
        },
      },
    })

    type Response = InferApiHandlerResult<typeof contract>
    expectTypeOf<Response>().toEqualTypeOf<
      | { status: 200; contentType: 'application/json'; body: { rows: number } }
      | { status: 200; contentType: 'application/vnd.report+json'; body: { report: string } }
    >()

    // Omitting contentType, or pairing it with the other variant's body, is rejected.
    expectTypeOf<{ status: 200; body: { rows: number } }>().not.toMatchTypeOf<Response>()
    expectTypeOf<{
      status: 200
      contentType: 'application/vnd.report+json'
      body: { rows: number }
    }>().not.toMatchTypeOf<Response>()
  })

  it('keeps contentType optional for a single-media-type content map', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Export CSV',
      pathResolver: () => '/export.csv',
      responsesByStatusCode: {
        200: { content: { 'text/csv': blobBody() } },
      },
    })

    type Response = InferApiHandlerResult<typeof contract>
    expectTypeOf<{ status: 200; body: string }>().toMatchTypeOf<Response>()
    expectTypeOf<{ status: 200; contentType: 'text/csv'; body: string }>().toMatchTypeOf<Response>()
    // A contentType the status does not declare is rejected.
    expectTypeOf<{
      status: 200
      contentType: 'text/html'
      body: string
    }>().not.toMatchTypeOf<Response>()
  })

  it('types the body as the schema input — defaults/transforms are applied by the serializer', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Get settings',
      pathResolver: () => '/settings',
      responsesByStatusCode: {
        200: z.object({
          limit: z.number().default(10),
          updatedAt: z.date().transform((d) => d.toISOString()),
        }),
      },
    })

    type Body = InferApiHandlerResult<typeof contract>['body']
    // `limit` may be omitted (default applies on serialization); `updatedAt` is the
    // pre-transform Date, not the serialized string.
    expectTypeOf<{ updatedAt: Date }>().toMatchTypeOf<Body>()
    expectTypeOf<{ limit: number; updatedAt: Date }>().toMatchTypeOf<Body>()
    expectTypeOf<{ limit: number; updatedAt: string }>().not.toMatchTypeOf<Body>()
  })

  it('requires body: null for a no-body response', () => {
    expectTypeOf<InferApiHandlerResult<typeof deleteUserContract>>().toEqualTypeOf<{
      status: 204
      body: null
    }>()

    // Omitting the body (or passing undefined) is rejected — `null` is mandatory.
    expectTypeOf<{ status: 204 }>().not.toMatchTypeOf<
      InferApiHandlerResult<typeof deleteUserContract>
    >()
    expectTypeOf<{ status: 204; body: undefined }>().not.toMatchTypeOf<
      InferApiHandlerResult<typeof deleteUserContract>
    >()
  })
})

// ============================================================================
// InferApiHandler — shape inference by response mode (type-level)
// ============================================================================

describe('InferApiHandler', () => {
  it('passes a context without sse for a non-SSE contract', () => {
    type Context = Parameters<InferApiHandler<typeof getUserContract>>[2]
    expectTypeOf<Context>().toEqualTypeOf<ApiHandlerContext<typeof getUserContract>>()
    expectTypeOf<Context>().toHaveProperty('expectedContentType')
    expectTypeOf<Context>().not.toHaveProperty('sse')
  })

  it('extends the context with sse for an SSE-only contract', () => {
    type Context = Parameters<InferApiHandler<typeof sseOnlyContract>>[2]
    expectTypeOf<Context['sse']>().toEqualTypeOf<
      SSEContext<InferSseSuccessResponses<(typeof sseOnlyContract)['responsesByStatusCode']>>
    >()
  })

  it('extends the context with sse for a dual-mode contract', () => {
    type Context = Parameters<InferApiHandler<typeof dualModeContract>>[2]
    expectTypeOf<Context['sse']>().toEqualTypeOf<
      SSEContext<InferSseSuccessResponses<(typeof dualModeContract)['responsesByStatusCode']>>
    >()
  })

  it('types expectedContentType as the union of the contract-declared content-types', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Export data',
      pathResolver: () => '/export',
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': z.object({ rows: z.number() }),
            'text/csv': blobBody(),
          },
        },
        404: z.object({ error: z.string() }),
      },
    })

    type Context = Parameters<InferApiHandler<typeof contract>>[2]
    expectTypeOf<Context['expectedContentType']>().toEqualTypeOf<
      'application/json' | 'text/csv' | null
    >()
  })
})

// ============================================================================
// buildFastifyApiRoute — call-site typing (type-level)
// ============================================================================

describe('buildFastifyApiRoute typing', () => {
  it('returns a Fastify RouteOptions', () => {
    const route = buildFastifyApiRoute(createUserContract, async () => ({
      status: 201,
      body: { id: '1', name: 'Alice' },
    }))
    expectTypeOf(route).toEqualTypeOf<RouteOptions>()
  })

  it('rejects a status code not declared on the contract', () => {
    buildFastifyApiRoute(
      createUserContract,
      // @ts-expect-error 418 is not a declared response status code
      async () => ({ status: 418, body: { id: '1', name: 'Alice' } }),
    )
  })

  it('accepts a single merged handler that returns JSON or streams for a dual-mode contract', () => {
    buildFastifyApiRoute(dualModeContract, (request, _reply, { expectedContentType, sse }) => {
      expectTypeOf(request.body).toEqualTypeOf<{ message: string }>()
      if (expectedContentType === 'text/event-stream') {
        sse.start('autoClose')
        return
      }
      // The 200 status declares two media types, so the contentType is required.
      return { status: 200, contentType: 'application/json', body: { id: '1', name: 'A' } }
    })
  })

  it('requires a contentType from a dual-mode handler returning JSON', () => {
    buildFastifyApiRoute(dualModeContract, (_request, _reply) =>
      // @ts-expect-error contentType is required when the status declares several media types
      ({ status: 200, body: { id: '1', name: 'A' } }),
    )
  })

  it('rejects an undeclared status code from a dual-mode handler', () => {
    buildFastifyApiRoute(dualModeContract, (_request, _reply) =>
      // @ts-expect-error 418 is not a declared response status code
      ({ status: 418, body: { id: '1', name: 'A' } }),
    )
  })

  it('accepts a returned { status, body } whose body is an async iterable of contract events', () => {
    buildFastifyApiRoute(sseOnlyContract, (_request, _reply) => ({
      status: 200,
      // biome-ignore lint/suspicious/useAwait: async is required to satisfy AsyncIterable
      body: (async function* () {
        yield { event: 'update', data: { value: 1 } } as const
        yield { event: 'done', data: { total: 1 } } as const
      })(),
    }))
  })

  it('types each streamed event against the contract event schemas', () => {
    type Event = SSEStreamMessage<
      InferSseSuccessResponses<(typeof sseOnlyContract)['responsesByStatusCode']>
    >

    expectTypeOf<{ event: 'update'; data: { value: number } }>().toMatchTypeOf<Event>()
    // @ts-expect-error 'nope' is not a declared SSE event name
    expectTypeOf<{ event: 'nope'; data: { value: number } }>().toMatchTypeOf<Event>()
  })

  it('infers request typing inside the handler', () => {
    const contract = defineApiContract({
      method: 'post',
      summary: 'Create an org user',
      requestBodySchema: z.object({ name: z.string() }),
      requestPathParamsSchema: z.object({ orgId: z.string() }),
      pathResolver: (p) => `/orgs/${p.orgId}/users`,
      responsesByStatusCode: { 201: userSchema },
    })

    buildFastifyApiRoute(contract, (request) => {
      expectTypeOf(request.body).toEqualTypeOf<{ name: string }>()
      expectTypeOf(request.params).toEqualTypeOf<{ orgId: string }>()
      return { status: 201, body: { id: '1', name: request.body.name } }
    })
  })
})
