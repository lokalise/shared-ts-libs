import {
  blobBody,
  ContractNoBody,
  defineApiContract,
  type InferSseSuccessResponses,
  noBodyResponse,
  sseBody,
} from '@lokalise/api-contracts'
import type { RouteOptions } from 'fastify'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type {
  ApiHandlerContext,
  InferApiHandler,
  InferApiHandlerRequest,
  InferApiHandlerResult,
} from './apiHandlerTypes.ts'
import { buildFastifyApiRoute } from './buildFastifyApiRoute.ts'
import type { SSEContext, SSEStreamMessage } from './sseTypes.ts'

const userSchema = z.object({ id: z.string(), name: z.string() })
const sseEventsSchema = {
  chunk: z.object({ delta: z.string() }),
  done: z.object({ total: z.number() }),
}

// ============================================================================
// InferApiHandlerRequest
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
    const contract = defineApiContract({
      method: 'post',
      summary: 'Create a user',
      requestBodySchema: z.object({ name: z.string() }),
      pathResolver: () => '/users',
      responsesByStatusCode: { 201: userSchema },
    })

    type Request = InferApiHandlerRequest<typeof contract>
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
// InferApiHandlerResult
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
    const contract = defineApiContract({
      method: 'get',
      summary: 'Stream updates',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
      },
    })

    // An SSE response surfaces as a { status, body } whose body streams the contract events;
    // with a single declared media type the contentType is optional.
    expectTypeOf<InferApiHandlerResult<typeof contract>>().toEqualTypeOf<{
      status: 200
      contentType?: 'text/event-stream'
      body: AsyncIterable<
        SSEStreamMessage<InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>>
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

  it('requires body: null for a no-body response', () => {
    const contract = defineApiContract({
      method: 'delete',
      summary: 'Delete a user',
      requestPathParamsSchema: z.object({ id: z.string() }),
      pathResolver: (p) => `/users/${p.id}`,
      responsesByStatusCode: { 204: noBodyResponse() },
    })

    expectTypeOf<InferApiHandlerResult<typeof contract>>().toEqualTypeOf<{
      status: 204
      body: null
    }>()

    // Omitting the body (or passing undefined) is rejected — `null` is mandatory.
    expectTypeOf<{ status: 204 }>().not.toMatchTypeOf<InferApiHandlerResult<typeof contract>>()
    expectTypeOf<{ status: 204; body: undefined }>().not.toMatchTypeOf<
      InferApiHandlerResult<typeof contract>
    >()
  })
})

// ============================================================================
// InferApiHandler — shape inference by response mode
// ============================================================================

describe('InferApiHandler', () => {
  it('passes a context without sse for a non-SSE contract', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'List users',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: userSchema },
    })

    type Context = Parameters<InferApiHandler<typeof contract>>[2]
    expectTypeOf<Context>().toEqualTypeOf<ApiHandlerContext<typeof contract>>()
    expectTypeOf<Context>().toHaveProperty('expectedContentType')
    expectTypeOf<Context>().not.toHaveProperty('sse')
  })

  it('extends the context with sse for an SSE-only contract', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Stream updates',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
      },
    })

    type Context = Parameters<InferApiHandler<typeof contract>>[2]
    expectTypeOf<Context['sse']>().toEqualTypeOf<
      SSEContext<InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>>
    >()
  })

  it('extends the context with sse for a dual-mode contract', () => {
    const contract = defineApiContract({
      method: 'post',
      summary: 'Chat',
      requestBodySchema: z.object({ message: z.string() }),
      pathResolver: () => '/chat',
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': userSchema,
            'text/event-stream': sseBody(sseEventsSchema),
          },
        },
      },
    })

    type Context = Parameters<InferApiHandler<typeof contract>>[2]
    expectTypeOf<Context['sse']>().toEqualTypeOf<
      SSEContext<InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>>
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
      'application/json' | 'text/csv' | undefined
    >()
  })
})

// ============================================================================
// buildFastifyApiRoute — call-site typing
// ============================================================================

describe('buildFastifyApiRoute typing', () => {
  it('returns a Fastify RouteOptions', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'List users',
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
      summary: 'List users',
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
      summary: 'Chat',
      requestBodySchema: z.object({ message: z.string() }),
      pathResolver: () => '/chat',
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': userSchema,
            'text/event-stream': sseBody(sseEventsSchema),
          },
        },
      },
    })

    buildFastifyApiRoute(contract, (request, _reply, { expectedContentType, sse }) => {
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
    const contract = defineApiContract({
      method: 'post',
      summary: 'Chat',
      requestBodySchema: z.object({ message: z.string() }),
      pathResolver: () => '/chat',
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': userSchema,
            'text/event-stream': sseBody(sseEventsSchema),
          },
        },
      },
    })

    buildFastifyApiRoute(contract, (_request, _reply) =>
      // @ts-expect-error contentType is required when the status declares several media types
      ({ status: 200, body: { id: '1', name: 'A' } }),
    )
  })

  it('rejects an undeclared status code from a dual-mode handler', () => {
    const contract = defineApiContract({
      method: 'post',
      summary: 'Chat',
      requestBodySchema: z.object({ message: z.string() }),
      pathResolver: () => '/chat',
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': userSchema,
            'text/event-stream': sseBody(sseEventsSchema),
          },
        },
      },
    })

    buildFastifyApiRoute(contract, (_request, _reply) =>
      // @ts-expect-error 418 is not a declared response status code
      ({ status: 418, body: { id: '1', name: 'A' } }),
    )
  })

  it('accepts a returned { status, body } whose body is an async iterable of contract events', () => {
    const contract = defineApiContract({
      method: 'get',
      summary: 'Stream updates',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
      },
    })

    buildFastifyApiRoute(contract, (_request, _reply) => ({
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
      summary: 'Stream updates',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
      },
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
