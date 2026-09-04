import { ContractNoBody, defineApiContract, sseResponse } from '@lokalise/api-contracts'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { FallbackParamsValidationError, FallbackUnsupportedParamError } from './errors.ts'
import { buildFallbackParams } from './params.ts'

const snapshotSchema = z.object({ version: z.number(), status: z.string() })

const uploadStatusContract = defineApiContract({
  visibility: 'public',
  summary: 'Upload status',
  method: 'get',
  pathResolver: (params: { uploadId: string }) => `/uploads/${params.uploadId}/status`,
  requestPathParamsSchema: z.object({ uploadId: z.string() }),
  requestQuerySchema: z.object({
    verbose: z.coerce.boolean().default(false),
    limit: z.number().optional(),
  }),
  responsesByStatusCode: {
    200: {
      content: {
        'application/json': snapshotSchema,
        ...sseResponse({ uploadFinished: z.object({ version: z.number() }) }).content,
      },
    },
  },
})

const startImportContract = defineApiContract({
  visibility: 'public',
  summary: 'Start import',
  method: 'post',
  pathResolver: () => '/imports',
  requestBodySchema: z.object({ fileId: z.string() }),
  requestHeaderSchema: z.object({ 'x-tenant': z.string() }),
  responsesByStatusCode: { 200: snapshotSchema },
})

const bodylessContract = defineApiContract({
  visibility: 'public',
  summary: 'Trigger reindex',
  method: 'post',
  requestBodySchema: ContractNoBody,
  pathResolver: () => '/reindex',
  responsesByStatusCode: { 200: snapshotSchema },
})

const filterContract = defineApiContract({
  visibility: 'public',
  summary: 'Filter items',
  method: 'get',
  pathResolver: () => '/items',
  requestQuerySchema: z.object({ filter: z.object({ status: z.string() }).optional() }),
  responsesByStatusCode: { 200: snapshotSchema },
})

const listContract = defineApiContract({
  visibility: 'public',
  summary: 'List items',
  method: 'get',
  pathResolver: () => '/items',
  requestQuerySchema: z.object({ tag: z.array(z.string()).optional() }),
  responsesByStatusCode: { 200: snapshotSchema },
})

describe('buildFallbackParams', () => {
  it('returns the params the binding needs, with Zod defaults applied', () => {
    const params = buildFallbackParams(uploadStatusContract, {
      pathParams: { uploadId: 'u-1' },
      queryParams: { limit: 5 },
    })

    expect(params).toEqual({
      pathParams: { uploadId: 'u-1' },
      queryParams: { verbose: false, limit: 5 },
    })
  })

  it('omits query values that resolve to nothing', () => {
    const params = buildFallbackParams(uploadStatusContract, {
      pathParams: { uploadId: 'u-1' },
      queryParams: { limit: undefined },
    })

    expect(params.queryParams).toEqual({ verbose: false })
  })

  it('passes a static header map and a request body through', () => {
    const params = buildFallbackParams(startImportContract, {
      body: { fileId: 'f-1' },
      headers: { 'x-tenant': 'acme' },
    })

    expect(params).toEqual({ body: { fileId: 'f-1' }, headers: { 'x-tenant': 'acme' } })
  })

  it('accepts a contract that declares no request schemas at all', () => {
    expect(buildFallbackParams(bodylessContract, {})).toEqual({})
  })

  describe('validation', () => {
    it('rejects invalid path params', () => {
      expect(() =>
        buildFallbackParams(uploadStatusContract, {
          // @ts-expect-error — the contract types uploadId as a string
          pathParams: { uploadId: 42 },
        }),
      ).toThrowError(FallbackParamsValidationError)
    })

    it('rejects invalid query params, naming the contract', () => {
      let caught: unknown
      try {
        buildFallbackParams(uploadStatusContract, {
          pathParams: { uploadId: 'u-1' },
          // @ts-expect-error — the contract types limit as a number
          queryParams: { limit: 'many' },
        })
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(FallbackParamsValidationError)
      const error = caught as FallbackParamsValidationError
      expect(error.part).toBe('queryParams')
      expect(error.summary).toBe('Upload status')
      expect(error.issues).toHaveLength(1)
      expect(error.message).toContain('Invalid queryParams for subscription to "Upload status"')
    })

    it('rejects an invalid request body', () => {
      expect(() =>
        buildFallbackParams(startImportContract, {
          // @ts-expect-error — the contract requires fileId
          body: {},
          headers: { 'x-tenant': 'acme' },
        }),
      ).toThrowError(FallbackParamsValidationError)
    })

    it('rejects a repeated query parameter, which the request shape cannot carry', () => {
      let caught: unknown
      try {
        buildFallbackParams(listContract, { queryParams: { tag: ['a', 'b'] } })
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(FallbackUnsupportedParamError)
      const error = caught as FallbackUnsupportedParamError
      expect(error.param).toBe('tag')
      expect(error.message).toContain(
        'is a list, which a fallback subscription request cannot carry',
      )
    })

    it('rejects a structured query parameter', () => {
      expect(() =>
        buildFallbackParams(filterContract, { queryParams: { filter: { status: 'pending' } } }),
      ).toThrowError(/is structured, which a fallback subscription request cannot carry/)
    })
  })

  describe('types', () => {
    it('requires the params the contract declares', () => {
      expectTypeOf(buildFallbackParams<typeof startImportContract>)
        .parameter(1)
        .toExtend<{ body: { fileId: string }; headers: { 'x-tenant': string } }>()
    })
  })
})
