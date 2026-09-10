import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody } from './constants.ts'
import { blobBody, noBodyResponse, sseBody } from './contractResponse.ts'
import { defineApiContract } from './defineApiContract.ts'
import type {
  InferServerRequest,
  InferServerResponse,
  InferServerResponseContentTypes,
  InferServerSseSelections,
  SseStreamMessage,
} from './serverTypes.ts'

const userSchema = z.object({ id: z.string(), name: z.string() })

const sseEventsSchema = {
  update: z.object({ value: z.number() }),
  done: z.object({ total: z.number() }),
}

const dualModeContract = defineApiContract({
  visibility: 'public',
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
    400: z.object({ error: z.string() }),
  },
})

describe('serverTypes', () => {
  describe('InferServerRequest', () => {
    it('infers the validated output of each request schema for a GET contract', () => {
      const contract = defineApiContract({
        visibility: 'public',
        method: 'get',
        summary: 'Get a user',
        requestPathParamsSchema: z.object({ userId: z.string() }),
        requestQuerySchema: z.object({ limit: z.coerce.number().default(10) }),
        requestHeaderSchema: z.object({ authorization: z.string() }),
        pathResolver: (p) => `/users/${p.userId}`,
        responsesByStatusCode: { 200: userSchema },
      })

      type Request = InferServerRequest<typeof contract>
      expectTypeOf<Request['pathParams']>().toEqualTypeOf<{ userId: string }>()
      // The server sees the parsed value, so the default has already been applied.
      expectTypeOf<Request['queryParams']>().toEqualTypeOf<{ limit: number }>()
      expectTypeOf<Request['headers']>().toEqualTypeOf<{ authorization: string }>()
      expectTypeOf<Request['body']>().toEqualTypeOf<undefined>()
    })

    it('infers the body for a payload contract and undefined for a ContractNoBody one', () => {
      expectTypeOf<InferServerRequest<typeof dualModeContract>['body']>().toEqualTypeOf<{
        message: string
      }>()

      const noBodyContract = defineApiContract({
        visibility: 'public',
        method: 'post',
        summary: 'Ping',
        requestBodySchema: ContractNoBody,
        pathResolver: () => '/ping',
        responsesByStatusCode: { 204: noBodyResponse() },
      })
      expectTypeOf<InferServerRequest<typeof noBodyContract>['body']>().toEqualTypeOf<undefined>()
    })
  })

  describe('InferServerResponse', () => {
    it('builds a discriminated union of { status, body } pairs over JSON responses', () => {
      const contract = defineApiContract({
        visibility: 'public',
        method: 'get',
        summary: 'List users',
        pathResolver: () => '/users',
        responsesByStatusCode: {
          200: userSchema,
          404: z.object({ error: z.string() }),
        },
      })

      expectTypeOf<InferServerResponse<typeof contract>>().toEqualTypeOf<
        | { status: 200; body: { id: string; name: string } }
        | { status: 404; body: { error: string } }
      >()
    })

    it('expands a range status key to its concrete statuses, minus the exactly-declared ones', () => {
      const contract = defineApiContract({
        visibility: 'public',
        method: 'get',
        summary: 'Get data',
        pathResolver: () => '/data',
        responsesByStatusCode: {
          200: z.object({ ok: z.boolean() }),
          404: z.object({ code: z.string() }),
          '4xx': z.object({ error: z.string() }),
        },
      })

      type Response = InferServerResponse<typeof contract>
      expectTypeOf<{ status: 400; body: { error: string } }>().toExtend<Response>()
      expectTypeOf<{ status: 418; body: { error: string } }>().toExtend<Response>()
      expectTypeOf<{ status: 404; body: { code: string } }>().toExtend<Response>()
      expectTypeOf<{ status: 404; body: { error: string } }>().not.toExtend<Response>()
    })

    it("expands a 'default' status key to the statuses no other key covers", () => {
      const contract = defineApiContract({
        visibility: 'public',
        method: 'get',
        summary: 'Get data',
        pathResolver: () => '/data',
        responsesByStatusCode: {
          200: z.object({ ok: z.boolean() }),
          '4xx': z.object({ error: z.string() }),
          default: z.object({ fallback: z.string() }),
        },
      })

      type Response = InferServerResponse<typeof contract>
      expectTypeOf<{ status: 503; body: { fallback: string } }>().toExtend<Response>()
      expectTypeOf<{ status: 200; body: { fallback: string } }>().not.toExtend<Response>()
      expectTypeOf<{ status: 404; body: { fallback: string } }>().not.toExtend<Response>()
    })

    it('requires a contentType discriminating the body when a status declares several media types', () => {
      expectTypeOf<InferServerResponse<typeof dualModeContract>>().toEqualTypeOf<
        | { status: 200; contentType: 'application/json'; body: { id: string; name: string } }
        | {
            status: 200
            contentType: 'text/event-stream'
            body: AsyncIterable<SseStreamMessage<typeof sseEventsSchema>>
          }
        | { status: 400; body: { error: string } }
      >()
    })

    it('uses the adapter-provided blob body type, defaulting to unknown', () => {
      const contract = defineApiContract({
        visibility: 'public',
        method: 'get',
        summary: 'Export CSV',
        pathResolver: () => '/export.csv',
        responsesByStatusCode: {
          200: { content: { 'text/csv': blobBody() } },
        },
      })

      expectTypeOf<InferServerResponse<typeof contract>>().toEqualTypeOf<{
        status: 200
        contentType?: 'text/csv'
        body: unknown
      }>()
      expectTypeOf<InferServerResponse<typeof contract, ReadableStream>>().toEqualTypeOf<{
        status: 200
        contentType?: 'text/csv'
        body: ReadableStream
      }>()
    })

    it('types the body as the schema input, since the serializer applies defaults and transforms', () => {
      const contract = defineApiContract({
        visibility: 'public',
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

      type Body = InferServerResponse<typeof contract>['body']
      expectTypeOf<{ updatedAt: Date }>().toExtend<Body>()
      expectTypeOf<{ limit: number; updatedAt: string }>().not.toExtend<Body>()
    })

    it('requires body: null for a no-body response', () => {
      const contract = defineApiContract({
        visibility: 'public',
        method: 'delete',
        summary: 'Delete',
        pathResolver: () => '/users/1',
        responsesByStatusCode: { 204: noBodyResponse() },
      })

      expectTypeOf<InferServerResponse<typeof contract>>().toEqualTypeOf<{
        status: 204
        body: null
      }>()
    })
  })

  describe('InferServerResponseContentTypes', () => {
    it('collects the content types of success responses only', () => {
      expectTypeOf<InferServerResponseContentTypes<typeof dualModeContract>>().toEqualTypeOf<
        'application/json' | 'text/event-stream'
      >()
    })

    it('treats a bare schema as application/json and excludes error-only content types', () => {
      const contract = defineApiContract({
        visibility: 'public',
        method: 'get',
        summary: 'Get',
        pathResolver: () => '/x',
        responsesByStatusCode: {
          200: userSchema,
          404: { content: { 'application/problem+json': z.object({ detail: z.string() }) } },
        },
      })

      expectTypeOf<
        InferServerResponseContentTypes<typeof contract>
      >().toEqualTypeOf<'application/json'>()
    })
  })

  describe('InferServerSseSelections', () => {
    it('lists one selection per sseBody descriptor and expands wildcard statuses', () => {
      const contract = defineApiContract({
        visibility: 'public',
        method: 'get',
        summary: 'Stream',
        pathResolver: () => '/stream',
        responsesByStatusCode: {
          200: { content: { 'text/event-stream': sseBody(sseEventsSchema) } },
          '2xx': {
            content: { 'application/vnd.progress+stream': sseBody({ tick: z.object({}) }) },
          },
          404: z.object({ error: z.string() }),
        },
      })

      type Selections = InferServerSseSelections<typeof contract>
      expectTypeOf<{
        statusCode: 200
        contentType: 'text/event-stream'
        events: typeof sseEventsSchema
      }>().toExtend<Selections>()
      // The '2xx' selection covers concrete statuses other than the exactly-declared 200.
      expectTypeOf<
        Extract<Selections, { contentType: 'application/vnd.progress+stream' }>['statusCode']
      >().toEqualTypeOf<201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226>()
      expectTypeOf<Extract<Selections, { statusCode: 404 }>>().toEqualTypeOf<never>()
    })
  })
})
