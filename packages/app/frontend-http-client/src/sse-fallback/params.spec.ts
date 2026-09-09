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

const sinceContract = defineApiContract({
  visibility: 'public',
  summary: 'Changes since',
  method: 'get',
  pathResolver: () => '/changes',
  requestQuerySchema: z.object({
    since: z.coerce.date().optional(),
    page: z.coerce.number().default(1),
  }),
  responsesByStatusCode: { 200: snapshotSchema },
})

const defaultedDateContract = defineApiContract({
  visibility: 'public',
  summary: 'Changes since epoch',
  method: 'get',
  pathResolver: () => '/changes',
  requestQuerySchema: z.object({
    since: z.coerce.date().default(() => new Date('2020-01-01T00:00:00.000Z')),
  }),
  responsesByStatusCode: { 200: snapshotSchema },
})

const tenantContract = defineApiContract({
  visibility: 'public',
  summary: 'Tenant status',
  method: 'get',
  pathResolver: () => '/status',
  requestHeaderSchema: z.object({
    authorization: z.string(),
    'x-tenant': z.string().min(2),
  }),
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

  describe('query values a flat string map has to carry', () => {
    it('sends what the caller supplied when the schema parses it into a Date', () => {
      const params = buildFallbackParams(sinceContract, {
        queryParams: { since: '2024-05-01T00:00:00.000Z' },
      })

      // The contract accepts the string, so there is no scalar the caller
      // could have passed instead — and it is what `sendByApiContract` would
      // have put on the query string for the same contract.
      expect(params.queryParams).toEqual({ since: '2024-05-01T00:00:00.000Z', page: 1 })
    })

    it('serializes a Date the caller never supplied, so a default still reaches the wire', () => {
      const params = buildFallbackParams(defaultedDateContract, { queryParams: {} })

      expect(params.queryParams).toEqual({ since: '2020-01-01T00:00:00.000Z' })
    })

    it('keeps a coercion whose output is already a scalar', () => {
      const params = buildFallbackParams(sinceContract, { queryParams: { page: '3' } })

      expect(params.queryParams).toEqual({ page: 3 })
    })
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

    describe('headers', () => {
      it('rejects a supplied header the contract schema refuses', () => {
        let caught: unknown
        try {
          buildFallbackParams(tenantContract, {
            headers: { authorization: 'Bearer t', 'x-tenant': 'a' },
          })
        } catch (error) {
          caught = error
        }

        expect(caught).toBeInstanceOf(FallbackParamsValidationError)
        expect((caught as FallbackParamsValidationError).part).toBe('headers')
        expect((caught as FallbackParamsValidationError).message).toContain(
          'Invalid headers for subscription to "Tenant status"',
        )
      })

      it('does not demand a header the transport supplies fresh per request', () => {
        // `authorization` belongs on the transport's own `headers` option,
        // which is what lets `onAuthChallenge` recover an expired token —
        // demanding it here would reject the setup this module recommends.
        expect(buildFallbackParams(tenantContract, { headers: { 'x-tenant': 'acme' } })).toEqual({
          headers: { 'x-tenant': 'acme' },
        })
      })

      it('passes a header the contract does not declare through untouched', () => {
        const params = buildFallbackParams(tenantContract, {
          // @ts-expect-error — the contract declares no x-trace header
          headers: { 'x-tenant': 'acme', 'x-trace': 'abc' },
        })

        expect(params.headers).toEqual({ 'x-tenant': 'acme', 'x-trace': 'abc' })
      })
    })
  })

  describe('types', () => {
    it('requires the params the contract declares', () => {
      expectTypeOf(buildFallbackParams<typeof startImportContract>)
        .parameter(1)
        .toExtend<{ body: { fileId: string } }>()
    })

    it('lets the transport layer supply part of the declared headers', () => {
      // Not `{ headers: { authorization, 'x-tenant' } }`: a request's headers
      // come from two layers, and the rotating one belongs on the transport.
      expectTypeOf(buildFallbackParams<typeof tenantContract>)
        .parameter(1)
        .toExtend<{ headers?: { authorization?: string; 'x-tenant'?: string } }>()
    })
  })
})
