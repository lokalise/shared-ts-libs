import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type { InferNonSseClientResponse, InferSseClientResponse } from './clientTypes.ts'
import { blobBody, jsonResponse, noContent, sseBody, sseResponse } from './contractResponse.ts'
import { defineApiContract } from './defineApiContract.ts'
import type {
  ContractResponseMode,
  HasAnySseSuccessResponse,
  InferSseSuccessResponses,
  IsNoBodySuccessResponse,
} from './inferTypes.ts'

type DefaultHeaders = Record<string, string>
type ResponsesOf<C> = C extends { responsesByStatusCode: infer R } ? R : never

describe('content entries — inferTypes', () => {
  it('detects SSE success from a content-map sseBody', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: {
          content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
        },
      },
    })
    expectTypeOf<HasAnySseSuccessResponse<ResponsesOf<typeof contract>>>().toEqualTypeOf<true>()
    type Sse = InferSseSuccessResponses<ResponsesOf<typeof contract>>
    expectTypeOf<keyof Sse>().toEqualTypeOf<'chunk'>()
  })

  it("classifies a mixed JSON+SSE content map as 'dual'", () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/dual',
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': z.object({ id: z.string() }),
            'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }),
          },
        },
      },
    })
    expectTypeOf<ContractResponseMode<ResponsesOf<typeof contract>>>().toEqualTypeOf<'dual'>()
  })

  it('treats a no-body content entry as a no-body success', () => {
    const contract = defineApiContract({
      method: 'delete',
      pathResolver: () => '/x',
      responsesByStatusCode: { 204: noContent() },
    })
    expectTypeOf<IsNoBodySuccessResponse<ResponsesOf<typeof contract>>>().toEqualTypeOf<true>()
  })
})

describe('content entries — client response inference', () => {
  it('tags a JSON content entry with its contentType', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/users/1',
      responsesByStatusCode: { 200: jsonResponse(z.object({ id: z.string() })) },
    })
    expectTypeOf<InferNonSseClientResponse<typeof contract>>().toEqualTypeOf<{
      statusCode: 200
      contentType: 'application/json'
      headers: DefaultHeaders
      body: { id: string }
    }>()
  })

  it('discriminates multiple JSON media types by contentType', () => {
    const v1 = z.object({ v: z.literal(1) })
    const v2 = z.object({ v: z.literal(2) })
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/users/1',
      responsesByStatusCode: {
        200: { content: { 'application/json': v1, 'application/json+02': v2 } },
      },
    })
    expectTypeOf<InferNonSseClientResponse<typeof contract>>().toEqualTypeOf<
      | {
          statusCode: 200
          contentType: 'application/json'
          headers: DefaultHeaders
          body: { v: 1 }
        }
      | {
          statusCode: 200
          contentType: 'application/json+02'
          headers: DefaultHeaders
          body: { v: 2 }
        }
    >()
  })

  it('adds a null no-content variant when allowNoBody is set', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/users/1',
      responsesByStatusCode: {
        200: { content: { 'application/json': z.object({ id: z.string() }) }, allowNoBody: true },
      },
    })
    expectTypeOf<InferNonSseClientResponse<typeof contract>>().toEqualTypeOf<
      | {
          statusCode: 200
          contentType: 'application/json'
          headers: DefaultHeaders
          body: { id: string }
        }
      | { statusCode: 200; contentType?: undefined; headers: DefaultHeaders; body: null }
    >()
  })

  it('maps a no-body content entry to a null body', () => {
    const contract = defineApiContract({
      method: 'delete',
      pathResolver: () => '/users/1',
      responsesByStatusCode: { 204: noContent() },
    })
    expectTypeOf<InferNonSseClientResponse<typeof contract>>().toEqualTypeOf<{
      statusCode: 204
      contentType?: undefined
      headers: DefaultHeaders
      body: null
    }>()
  })

  it('maps a blob content entry to a Blob body', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/photo',
      responsesByStatusCode: { 200: { content: { 'image/png': blobBody() } } },
    })
    expectTypeOf<InferNonSseClientResponse<typeof contract>>().toEqualTypeOf<{
      statusCode: 200
      contentType: 'image/png'
      headers: DefaultHeaders
      body: Blob
    }>()
  })

  it('maps an SSE content entry to an AsyncIterable in SSE mode', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: {
          content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
        },
      },
    })
    type Result = InferSseClientResponse<typeof contract>
    expectTypeOf<Result['contentType']>().toEqualTypeOf<'text/event-stream'>()
    expectTypeOf<Result['body']>().toEqualTypeOf<
      AsyncIterable<{
        type: 'chunk'
        data: { delta: string }
        lastEventId: string
        retry: number | undefined
      }>
    >()
  })

  it('mixes legacy and content members in one response union', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/mixed',
      responsesByStatusCode: {
        200: jsonResponse(z.object({ id: z.string() })), // content entry → tagged
        404: z.object({ message: z.string() }), // legacy bare schema → no contentType
      },
    })
    expectTypeOf<InferNonSseClientResponse<typeof contract>>().toEqualTypeOf<
      | {
          statusCode: 200
          contentType: 'application/json'
          headers: DefaultHeaders
          body: { id: string }
        }
      | { statusCode: 404; headers: DefaultHeaders; body: { message: string } }
    >()
  })

  it('keeps legacy SSE contracts byte-identical (no contentType field)', () => {
    const contract = defineApiContract({
      method: 'get',
      pathResolver: () => '/legacy-stream',
      responsesByStatusCode: { 200: sseResponse({ chunk: z.object({ delta: z.string() }) }) },
    })
    expectTypeOf<InferSseClientResponse<typeof contract>>().toEqualTypeOf<{
      statusCode: 200
      headers: DefaultHeaders
      body: AsyncIterable<{
        type: 'chunk'
        data: { delta: string }
        lastEventId: string
        retry: number | undefined
      }>
    }>()
  })
})
