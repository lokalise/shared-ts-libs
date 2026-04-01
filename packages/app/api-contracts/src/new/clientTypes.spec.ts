import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody } from './constants.ts'
import { anyOfResponses, blobResponse, sseResponse, textResponse } from './contractResponse.ts'
import { defineApiContract } from './defineApiContract.ts'
import type { InferNonSseClientResponse, InferSseClientResponse } from './clientTypes.ts'

type DefaultHeaders = Record<string, string | string[] | undefined>

describe('clientTypes', () => {
  describe('InferSseClientResponse', () => {
    it('maps success code to SSE body and error code to as-is body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: sseResponse({ update: z.object({ id: z.string() }) }),
          404: z.object({ message: z.string() }),
        },
      })
      type Result = InferSseClientResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<
        | { statusCode: 200; headers: DefaultHeaders; body: AsyncIterable<{ event: 'update'; data: { id: string } }> }
        | { statusCode: 404; headers: DefaultHeaders; body: { message: string } }
      >()
    })

    it('extracts only SSE body for dual-mode success code', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: anyOfResponses([
            sseResponse({ chunk: z.object({ delta: z.string() }) }),
            z.object({ text: z.string() }),
          ]),
        },
      })
      type Result = InferSseClientResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: DefaultHeaders
        body: AsyncIterable<{ event: 'chunk'; data: { delta: string } }>
      }>()
    })

    it('returns a single entry for an SSE-only contract', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: sseResponse({ tick: z.object({ count: z.number() }) }),
        },
      })
      type Result = InferSseClientResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: DefaultHeaders
        body: AsyncIterable<{ event: 'tick'; data: { count: number } }>
      }>()
    })

    it('accepts a custom THeaders override', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: sseResponse({ tick: z.object({ count: z.number() }) }),
        },
      })
      type Result = InferSseClientResponse<
        (typeof contract)['responsesByStatusCode'],
        Record<string, string>
      >
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: Record<string, string>
        body: AsyncIterable<{ event: 'tick'; data: { count: number } }>
      }>()
    })
  })

  describe('InferNonSseClientResponse', () => {
    it('maps success code to non-SSE body and error code to as-is body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: {
          200: z.object({ id: z.number() }),
          404: z.object({ message: z.string() }),
        },
      })
      type Result = InferNonSseClientResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<
        | { statusCode: 200; headers: DefaultHeaders; body: { id: number } }
        | { statusCode: 404; headers: DefaultHeaders; body: { message: string } }
      >()
    })

    it('maps dual-mode success code to non-SSE body only', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: anyOfResponses([
            sseResponse({ chunk: z.object({ delta: z.string() }) }),
            z.object({ text: z.string() }),
          ]),
        },
      })
      type Result = InferNonSseClientResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: DefaultHeaders
        body: { text: string }
      }>()
    })

    it('maps ContractNoBody success to null body', () => {
      const contract = defineApiContract({
        method: 'delete',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 204: ContractNoBody },
      })
      type Result = InferNonSseClientResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<{ statusCode: 204; headers: DefaultHeaders; body: null }>()
    })

    it('maps text success response to string body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/export.csv',
        responsesByStatusCode: { 200: textResponse('text/csv') },
      })
      type Result = InferNonSseClientResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<{ statusCode: 200; headers: DefaultHeaders; body: string }>()
    })

    it('maps blob success response to Blob body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/photo.png',
        responsesByStatusCode: { 200: blobResponse('image/png') },
      })
      type Result = InferNonSseClientResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<{ statusCode: 200; headers: DefaultHeaders; body: Blob }>()
    })

    it('accepts a custom THeaders override', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: z.object({ id: z.number() }) },
      })
      type Result = InferNonSseClientResponse<
        (typeof contract)['responsesByStatusCode'],
        Record<string, string>
      >
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: Record<string, string>
        body: { id: number }
      }>()
    })
  })
})
