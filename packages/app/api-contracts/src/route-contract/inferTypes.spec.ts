import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody } from './constants.ts'
import { anyOfResponses, blobResponse, sseResponse, textResponse } from './contractResponse.ts'
import { defineRouteContract } from './defineRouteContract.ts'
import type {
  HasAnySseSuccessResponse,
  InferJsonSuccessResponses,
  InferSseSuccessResponses,
} from './inferTypes.ts'

describe('inferTypes', () => {
  describe('InferJsonSuccessResponses', () => {
    it('returns never when no success response schemas are defined', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: { 404: z.object({ message: z.string() }) },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('extracts the union of JSON success schemas', () => {
      const schema200 = z.object({ name: z.string() })
      const schema201 = z.object({ id: z.string() })
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: {
          200: schema200,
          201: schema201,
          404: z.object({ message: z.string() }),
        },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<typeof schema200 | typeof schema201>()
    })

    it('returns never for ContractNoBody', () => {
      const contract = defineRouteContract({
        method: 'delete',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: { 204: ContractNoBody },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('returns never for textResponse', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: { 200: textResponse('text/csv') },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('returns never for blobResponse', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: { 200: blobResponse('image/png') },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('returns never for sseResponse', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: {
          200: sseResponse({ chunk: z.object({ delta: z.string() }) }),
        },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('extracts JSON schema from AnyOfResponses, excluding SSE', () => {
      const jsonSchema = z.object({ id: z.string() })
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: {
          200: anyOfResponses([
            sseResponse({ chunk: z.object({ delta: z.string() }) }),
            jsonSchema,
          ]),
        },
      })
      type Result = InferJsonSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<typeof jsonSchema>()
    })
  })

  describe('HasAnySseSuccessResponse', () => {
    it('returns false for JSON schema responses', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })

    it('returns false for ContractNoBody', () => {
      const contract = defineRouteContract({
        method: 'delete',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: { 204: ContractNoBody },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })

    it('returns true for sseResponse', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: {
          200: sseResponse({ chunk: z.object({ delta: z.string() }) }),
        },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<true>()
    })

    it('returns true for AnyOfResponses containing sseResponse', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: {
          200: anyOfResponses([
            sseResponse({ chunk: z.object({ delta: z.string() }) }),
            z.object({ id: z.string() }),
          ]),
        },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<true>()
    })

    it('returns false for AnyOfResponses containing only JSON schemas', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: { 200: anyOfResponses([z.object({ id: z.string() })]) },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })

    it('returns false for error-only status codes with sseResponse', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: {
          400: sseResponse({ chunk: z.object({ delta: z.string() }) }),
        },
      })
      type Result = HasAnySseSuccessResponse<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<false>()
    })
  })

  describe('InferSseSuccessResponses', () => {
    it('returns never for JSON schema responses', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
      })
      type Result = InferSseSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<Result>().toEqualTypeOf<never>()
    })

    it('extracts schemas object from sseResponse', () => {
      const chunkSchema = z.object({ delta: z.string() })
      const doneSchema = z.object({ finish_reason: z.string() })
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: {
          200: sseResponse({ chunk: chunkSchema, done: doneSchema }),
        },
      })
      type Result = InferSseSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<keyof Result>().toEqualTypeOf<'chunk' | 'done'>()
    })

    it('extracts SSE schemas object from AnyOfResponses', () => {
      const chunkSchema = z.object({ delta: z.string() })
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/test',
        responseSchemasByStatusCode: {
          200: anyOfResponses([sseResponse({ chunk: chunkSchema }), z.object({ id: z.string() })]),
        },
      })
      type Result = InferSseSuccessResponses<(typeof contract)['responseSchemasByStatusCode']>
      expectTypeOf<keyof Result>().toEqualTypeOf<'chunk'>()
    })
  })
})
