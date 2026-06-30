import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { blobBody, noBodyResponse, sseBody } from './contractResponse.ts'
import { defineApiContract } from './defineApiContract.ts'
import type {
  AvailableResponseModes,
  ContractResponseMode,
  HasAnyJsonSuccessResponse,
  HasAnySseSuccessResponse,
  InferJsonSuccessResponses,
  InferNonSseSuccessResponses,
  InferSseSuccessResponses,
} from './inferTypes.ts'

describe('inferTypes', () => {
  describe('InferJsonSuccessResponses', () => {
    it('returns never when no success response schemas are defined', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { 404: z.object({ message: z.string() }) },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('extracts the union of JSON success schemas', () => {
      const schema200 = z.object({ name: z.string() })
      const schema201 = z.object({ id: z.string() })
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: schema200,
          201: schema201,
          404: z.object({ message: z.string() }),
        },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<typeof schema200 | typeof schema201>()
    })

    it('returns never for noBodyResponse()', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'delete',
        pathResolver: () => '/test',
        responsesByStatusCode: { 204: noBodyResponse() },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('returns never for blobBody', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { 200: { content: { 'image/png': blobBody() } } },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('returns never for sseBody', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('extracts JSON schema from the 2xx range key', () => {
      const schema = z.object({ id: z.string() })
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { '2xx': schema },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<typeof schema>()
    })
  })

  describe('HasAnySseSuccessResponse', () => {
    it('returns false for JSON schema responses', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })

    it('returns false for noBodyResponse()', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'delete',
        pathResolver: () => '/test',
        responsesByStatusCode: { 204: noBodyResponse() },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })

    it('returns true for sseBody', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<true>()
    })

    it('returns false for error-only status codes with sseBody', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          400: {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })

    it('returns true for sseBody under the 2xx range key', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          '2xx': {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<true>()
    })

    it('returns false for sseBody under a non-success range key', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          '4xx': {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })

    it('returns true for sseBody under the default key', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          default: {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<true>()
    })

    it('returns false for non-SSE response under the default key', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { default: z.object({ message: z.string() }) },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })
  })

  describe('HasAnyJsonSuccessResponse', () => {
    it('returns true for a JSON schema at an exact success code', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })
      type Result = HasAnyJsonSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<true>()
    })

    it('returns false for SSE-only response', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = HasAnyJsonSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })

    it('returns true for 2xx: JSON schema', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { '2xx': z.object({ id: z.string() }) },
      })
      type Result = HasAnyJsonSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<true>()
    })

    it('returns false for 2xx: sseBody', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          '2xx': {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = HasAnyJsonSuccessResponse<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })
  })

  describe('InferNonSseSuccessResponses', () => {
    it('returns the output type of a JSON success schema', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })
      type Result = InferNonSseSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<{ id: string }>()
    })

    it('returns never for SSE-only response', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = InferNonSseSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('returns the output type for 2xx: JSON schema', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { '2xx': z.object({ id: z.string() }) },
      })
      type Result = InferNonSseSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<{ id: string }>()
    })

    it('returns never for 2xx: sseBody', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          '2xx': {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = InferNonSseSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })
  })

  describe('ContractResponseMode', () => {
    it('returns non-sse for a JSON-only contract', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })
      type Result = ContractResponseMode<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'non-sse'>()
    })

    it('returns sse for an SSE-only contract', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = ContractResponseMode<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'sse'>()
    })

    it('returns sse for 2xx: sseBody', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          '2xx': {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = ContractResponseMode<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'sse'>()
    })

    it('returns non-sse for 2xx: JSON schema', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { '2xx': z.object({ id: z.string() }) },
      })
      type Result = ContractResponseMode<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'non-sse'>()
    })
  })

  describe('AvailableResponseModes', () => {
    it('includes json for a JSON success response', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })
      type Result = AvailableResponseModes<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'json'>()
    })

    it('includes sse for an SSE-only response', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = AvailableResponseModes<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'sse'>()
    })

    it('includes json for 2xx: JSON schema', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { '2xx': z.object({ id: z.string() }) },
      })
      type Result = AvailableResponseModes<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'json'>()
    })

    it('includes sse for 2xx: sseBody', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          '2xx': {
            content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
          },
        },
      })
      type Result = AvailableResponseModes<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'sse'>()
    })

    it('includes noContent for noBodyResponse()', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'delete',
        pathResolver: () => '/test',
        responsesByStatusCode: { 204: noBodyResponse() },
      })
      type Result = AvailableResponseModes<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<'noContent'>()
    })
  })

  describe('InferSseSuccessResponses', () => {
    it('returns never for JSON schema responses', () => {
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })
      type Result = InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('extracts schemas object from sseBody', () => {
      const chunkSchema = z.object({ delta: z.string() })
      const doneSchema = z.object({ finish_reason: z.string() })
      const contract = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: {
            content: { 'text/event-stream': sseBody({ chunk: chunkSchema, done: doneSchema }) },
          },
        },
      })
      type Result = InferSseSuccessResponses<(typeof contract)['responsesByStatusCode']>
      expectTypeOf<keyof Result>().toEqualTypeOf<'chunk' | 'done'>()
    })
  })
})
