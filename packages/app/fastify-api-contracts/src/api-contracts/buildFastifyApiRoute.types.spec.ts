import {
  anyOfResponses,
  ContractNoBody,
  defineApiContract,
  type InferSseSuccessResponses,
  sseResponse,
} from '@lokalise/api-contracts'
import type { RouteOptions } from 'fastify'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type { InferApiHandler, InferApiRequest, InferApiStatusResponse } from './apiHandlerTypes.ts'
import { buildFastifyApiRoute, buildFastifyApiRouteHandler } from './buildFastifyApiRoute.ts'
import type { SSEContext, SSEStreamMessage, SyncModeReply } from './sseTypes.ts'

const userSchema = z.object({ id: z.string(), name: z.string() })
const sseEventsSchema = {
  chunk: z.object({ delta: z.string() }),
  done: z.object({ total: z.number() }),
}

// ============================================================================
// InferApiRequest
// ============================================================================

describe('InferApiRequest', () => {
  it('infers path params, query and headers for a GET contract', () => {
    const contract = defineApiContract({
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      requestQuerySchema: z.object({ limit: z.number() }),
      requestHeaderSchema: z.object({ authorization: z.string() }),
      pathResolver: (p) => `/users/${p.userId}`,
      responsesByStatusCode: { 200: userSchema },
    })

    type Request = InferApiRequest<typeof contract>
    expectTypeOf<Request['params']>().toEqualTypeOf<{ userId: string }>()
    expectTypeOf<Request['query']>().toEqualTypeOf<{ limit: number }>()
    expectTypeOf<Request['headers']>().toHaveProperty('authorization')
  })

  it('infers the body for a POST contract', () => {
    const contract = defineApiContract({
      method: 'post',
      requestBodySchema: z.object({ name: z.string() }),
      pathResolver: () => '/users',
      responsesByStatusCode: { 201: userSchema },
    })

    type Request = InferApiRequest<typeof contract>
    expectTypeOf<Request['body']>().toEqualTypeOf<{ name: string }>()
  })

  it('infers an undefined body for a ContractNoBody payload contract', () => {
    const contract = defineApiContract({
      method: 'post',
      requestBodySchema: ContractNoBody,
      pathResolver: () => '/ping',
      responsesByStatusCode: { 204: ContractNoBody },
    })

    // The route-level Body generic is `undefined`; Fastify surfaces an absent body
    // as `unknown` on `req.body` at the handler level.
    type Request = InferApiRequest<typeof contract>
    expectTypeOf<Request['body']>().toEqualTypeOf<unknown>()
  })
})

// ============================================================================
// InferApiStatusResponse
// ============================================================================

describe('InferApiStatusResponse', () => {
  it('builds a discriminated union of { status, body } pairs over JSON responses', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: {
        200: userSchema,
        404: z.object({ error: z.string() }),
      },
    })

    type Response = InferApiStatusResponse<typeof contract>
    expectTypeOf<Response>().toEqualTypeOf<
      { status: 200; body: { id: string; name: string } } | { status: 404; body: { error: string } }
    >()
  })

  it('infers an async-iterable body for an SSE response', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: { 200: sseResponse(sseEventsSchema) },
    })

    // An SSE response surfaces as a { status, body } whose body streams the contract events.
    expectTypeOf<InferApiStatusResponse<typeof contract>>().toEqualTypeOf<{
      status: 200
      body: AsyncIterable<
        SSEStreamMessage<InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>>
      >
    }>()
  })
})

// ============================================================================
// InferApiHandler — shape inference by response mode
// ============================================================================

describe('InferApiHandler', () => {
  it('infers a (request, reply) handler with no sse context for a non-SSE contract', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
    })

    // Exactly two params — no sse context is added for non-SSE contracts.
    expectTypeOf<Parameters<InferApiHandler<typeof contract>>>().toEqualTypeOf<
      [InferApiRequest<typeof contract>, SyncModeReply]
    >()
  })

  it('adds an sse context as the third arg for an SSE-only contract', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: { 200: sseResponse(sseEventsSchema) },
    })

    expectTypeOf<Parameters<InferApiHandler<typeof contract>>[2]>().toEqualTypeOf<
      SSEContext<InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>>
    >()
  })

  it('adds an sse context as the third arg for a dual-mode contract', () => {
    const contract = defineApiContract({
      method: 'post',
      requestBodySchema: z.object({ message: z.string() }),
      pathResolver: () => '/chat',
      responsesByStatusCode: {
        200: anyOfResponses([userSchema, sseResponse(sseEventsSchema)]),
      },
    })

    expectTypeOf<Parameters<InferApiHandler<typeof contract>>[2]>().toEqualTypeOf<
      SSEContext<InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>>
    >()
  })
})

// ============================================================================
// buildFastifyApiRoute / buildFastifyApiRouteHandler — call-site typing
// ============================================================================

describe('buildFastifyApiRoute typing', () => {
  it('returns a Fastify RouteOptions', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
    })

    const route = buildFastifyApiRoute(contract, async () => ({
      status: 200,
      body: { id: '1', name: 'Alice' },
    }))
    expectTypeOf(route).toEqualTypeOf<RouteOptions>()
  })

  it('rejects a status code not declared on the contract', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
    })

    buildFastifyApiRoute(
      contract,
      // @ts-expect-error 418 is not a declared response status code
      async () => ({ status: 418, body: { id: '1', name: 'Alice' } }),
    )
  })

  it('accepts a single merged handler that returns JSON or streams for a dual-mode contract', () => {
    const contract = defineApiContract({
      method: 'post',
      requestBodySchema: z.object({ message: z.string() }),
      pathResolver: () => '/chat',
      responsesByStatusCode: {
        200: anyOfResponses([userSchema, sseResponse(sseEventsSchema)]),
      },
    })

    buildFastifyApiRoute(contract, (request, _reply, sse) => {
      expectTypeOf(request.body).toEqualTypeOf<{ message: string }>()
      if (request.headers.accept === 'text/event-stream') {
        sse.start('autoClose')
        return
      }
      return { status: 200, body: { id: '1', name: 'A' } }
    })
  })

  it('rejects an undeclared status code from a dual-mode handler', () => {
    const contract = defineApiContract({
      method: 'post',
      requestBodySchema: z.object({ message: z.string() }),
      pathResolver: () => '/chat',
      responsesByStatusCode: {
        200: anyOfResponses([userSchema, sseResponse(sseEventsSchema)]),
      },
    })

    buildFastifyApiRoute(contract, (_request, _reply, _sse) =>
      // @ts-expect-error 418 is not a declared response status code
      ({ status: 418, body: { id: '1', name: 'A' } }),
    )
  })

  it('accepts a returned { status, body } whose body is an async iterable of contract events', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: { 200: sseResponse(sseEventsSchema) },
    })

    buildFastifyApiRoute(contract, (_request, _reply, _sse) => ({
      status: 200,
      // biome-ignore lint/suspicious/useAwait: async is required to satisfy AsyncIterable
      body: (async function* () {
        yield { event: 'chunk', data: { delta: 'hi' } } as const
        yield { event: 'done', data: { total: 1 } } as const
      })(),
    }))
  })

  it('types each streamed event against the contract event schemas', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: { 200: sseResponse(sseEventsSchema) },
    })
    type Event = SSEStreamMessage<
      InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>
    >

    expectTypeOf<{ event: 'chunk'; data: { delta: string } }>().toMatchTypeOf<Event>()
    // @ts-expect-error 'nope' is not a declared SSE event name
    expectTypeOf<{ event: 'nope'; data: { delta: string } }>().toMatchTypeOf<Event>()
  })

  it('infers request typing inside the handler', () => {
    const contract = defineApiContract({
      method: 'post',
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

  it('buildFastifyApiRouteHandler returns the contract-inferred handler type', () => {
    const contract = defineApiContract({
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      pathResolver: (p) => `/users/${p.userId}`,
      responsesByStatusCode: { 200: userSchema },
    })

    const handler = buildFastifyApiRouteHandler(contract, async (request) => ({
      status: 200,
      body: { id: request.params.userId, name: 'Alice' },
    }))

    expectTypeOf(handler).toEqualTypeOf<InferApiHandler<typeof contract>>()
  })
})
