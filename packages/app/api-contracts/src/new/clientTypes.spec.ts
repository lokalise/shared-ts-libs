import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type {
  ClientErrorHttpStatusCode,
  ExpandStatusRangeKey,
  HttpStatusCode,
  SuccessfulHttpStatusCode,
} from '../HttpStatusCodes.ts'
import type {
  ClientRequestParams,
  HeadersParam,
  InferNonSseClientResponse,
  InferSseClientResponse,
} from './clientTypes.ts'
import { ContractNoBody } from './constants.ts'
import {
  anyOfResponses,
  blobResponse,
  noBodyResponse,
  sseResponse,
  textResponse,
} from './contractResponse.ts'
import { defineApiContract } from './defineApiContract.ts'

type DefaultHeaders = Record<string, string>

describe('clientTypes', () => {
  describe('ClientRequestParams', () => {
    it('has no required fields for a minimal contract', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/ping',
        responsesByStatusCode: { 200: z.unknown() },
      })
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never
        pathParams?: undefined
        body?: undefined
        queryParams?: undefined
        headers?: undefined
        pathPrefix?: string
      }>()
    })

    it('requires pathParams when requestPathParamsSchema is defined', () => {
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        responsesByStatusCode: { 200: z.unknown() },
      })
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never
        pathParams: { id: string }
        body?: undefined
        queryParams?: undefined
        headers?: undefined
        pathPrefix?: string
      }>()
    })

    it('requires body when requestBodySchema is defined', () => {
      const contract = defineApiContract({
        method: 'post',
        pathResolver: () => '/products',
        requestBodySchema: z.object({ name: z.string() }),
        responsesByStatusCode: { 201: z.unknown() },
      })
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never
        pathParams?: undefined
        body: { name: string }
        queryParams?: undefined
        headers?: undefined
        pathPrefix?: string
      }>()
    })

    it('requires queryParams when requestQuerySchema is defined', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products',
        requestQuerySchema: z.object({ limit: z.number() }),
        responsesByStatusCode: { 200: z.unknown() },
      })
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never
        pathParams?: undefined
        body?: undefined
        queryParams: { limit: number }
        headers?: undefined
        pathPrefix?: string
      }>()
    })

    it('requires headers when requestHeaderSchema is defined, accepting plain object or function', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products',
        requestHeaderSchema: z.object({ authorization: z.string() }),
        responsesByStatusCode: { 200: z.unknown() },
      })
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never
        pathParams?: undefined
        body?: undefined
        queryParams?: undefined
        headers: HeadersParam<{ authorization: string }>
        pathPrefix?: string
      }>()
    })

    it('pathPrefix is always optional', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products',
        responsesByStatusCode: { 200: z.unknown() },
      })
      expectTypeOf<ClientRequestParams<typeof contract, false>['pathPrefix']>().toEqualTypeOf<
        string | undefined
      >()
    })

    it('forbids streaming field for non-SSE contracts', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products',
        responsesByStatusCode: { 200: z.unknown() },
      })
      expectTypeOf<ClientRequestParams<typeof contract, false>['streaming']>().toEqualTypeOf<
        never | undefined
      >()
    })

    it('forbids streaming field for SSE-only contracts', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: { 200: sseResponse({ update: z.object({ id: z.string() }) }) },
      })
      expectTypeOf<ClientRequestParams<typeof contract, true>['streaming']>().toEqualTypeOf<
        never | undefined
      >()
    })

    it('requires streaming: true for dual-mode contracts with TIsStreaming=true', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/feed',
        responsesByStatusCode: {
          200: anyOfResponses([
            sseResponse({ update: z.object({ id: z.string() }) }),
            z.object({ latest: z.string() }),
          ]),
        },
      })
      expectTypeOf<ClientRequestParams<typeof contract, true>['streaming']>().toEqualTypeOf<true>()
      expectTypeOf<
        ClientRequestParams<typeof contract, false>['streaming']
      >().toEqualTypeOf<false>()
    })
  })

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
      type Result = InferSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<
        | {
            statusCode: 200
            headers: DefaultHeaders
            body: AsyncIterable<{
              type: 'update'
              data: { id: string }
              lastEventId: string
              retry: number | undefined
            }>
          }
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
      type Result = InferSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
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

    it('returns a single entry for an SSE-only contract', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: sseResponse({ tick: z.object({ count: z.number() }) }),
        },
      })
      type Result = InferSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: DefaultHeaders
        body: AsyncIterable<{
          type: 'tick'
          data: { count: number }
          lastEventId: string
          retry: number | undefined
        }>
      }>()
    })

    it('includes typed headers when responseHeaderSchema is defined', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: sseResponse({ tick: z.object({ count: z.number() }) }),
        },
        responseHeaderSchema: z.object({ 'x-request-id': z.string() }),
      })
      type Result = InferSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: { 'x-request-id': string } & DefaultHeaders
        body: AsyncIterable<{
          type: 'tick'
          data: { count: number }
          lastEventId: string
          retry: number | undefined
        }>
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
      type Result = InferNonSseClientResponse<typeof contract>
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
      type Result = InferNonSseClientResponse<typeof contract>
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
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 204
        headers: DefaultHeaders
        body: null
      }>()
    })

    it('maps noBodyResponse() success to null body', () => {
      const contract = defineApiContract({
        method: 'delete',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 204: noBodyResponse() },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 204
        headers: DefaultHeaders
        body: null
      }>()
    })

    it('maps text success response to string body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/export.csv',
        responsesByStatusCode: { 200: textResponse('text/csv') },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: DefaultHeaders
        body: string
      }>()
    })

    it('maps blob success response to Blob body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/photo.png',
        responsesByStatusCode: { 200: blobResponse('image/png') },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: DefaultHeaders
        body: Blob
      }>()
    })

    it('includes typed headers when responseHeaderSchema is defined', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: z.object({ id: z.number() }) },
        responseHeaderSchema: z.object({ 'x-request-id': z.string() }),
      })
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: Omit<DefaultHeaders, 'x-request-id'> & {
          'x-request-id': string
        }
        body: { id: number }
      }>()
    })

    it('allows non-string transformed header types without collapsing to never', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: z.object({ id: z.number() }) },
        responseHeaderSchema: z.object({ 'x-retry-count': z.coerce.number() }),
      })
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: Omit<DefaultHeaders, 'x-retry-count'> & {
          'x-retry-count': number
        }
        body: { id: number }
      }>()
    })

    it('exact code takes precedence over 2xx range: narrowing by exact statusCode resolves only the exact body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          '2xx': z.object({ id: z.number() }),
          201: z.object({ name: z.string() }),
        },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      // Narrowing to 201 must yield only the exact entry's body, not the range body
      type At201 = Extract<Result, { statusCode: 201 }>
      expectTypeOf<At201>().toEqualTypeOf<{
        statusCode: 201
        headers: DefaultHeaders
        body: { name: string }
      }>()
      // The range entry must not include 201 in its statusCode union
      type RangeEntry = Extract<Result, { statusCode: Exclude<SuccessfulHttpStatusCode, 201> }>
      expectTypeOf<RangeEntry>().toEqualTypeOf<{
        statusCode: Exclude<SuccessfulHttpStatusCode, 201>
        headers: DefaultHeaders
        body: { id: number }
      }>()
    })

    it('maps 2xx range key to SuccessfulHttpStatusCode with non-SSE body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { '2xx': z.object({ id: z.number() }) },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: SuccessfulHttpStatusCode
        headers: DefaultHeaders
        body: { id: number }
      }>()
    })

    it('maps 4xx range key to 4xx status codes with as-is body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          200: z.object({ id: z.number() }),
          '4xx': z.object({ message: z.string() }),
        },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<
        | { statusCode: 200; headers: DefaultHeaders; body: { id: number } }
        | {
            statusCode: ExpandStatusRangeKey<'4xx'>
            headers: DefaultHeaders
            body: { message: string }
          }
      >()
    })

    it('maps default key to split success/non-success statusCode entries', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { default: z.object({ message: z.string() }) },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<
        | {
            statusCode: SuccessfulHttpStatusCode
            headers: DefaultHeaders
            body: { message: string }
          }
        | {
            statusCode: Exclude<HttpStatusCode, SuccessfulHttpStatusCode>
            headers: DefaultHeaders
            body: { message: string }
          }
      >()
    })

    it('range key takes precedence over default: range codes excluded from default statusCode', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          '4xx': z.object({ error: z.string() }),
          default: z.object({ message: z.string() }),
        },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      // The 4xx range entry covers all ClientErrorHttpStatusCode codes
      type RangeEntry = Extract<Result, { body: { error: string } }>
      expectTypeOf<RangeEntry['statusCode']>().toEqualTypeOf<ClientErrorHttpStatusCode>()
      // The default entry's statusCode must not include any 4xx code
      type DefaultEntry = Extract<Result, { body: { message: string } }>
      expectTypeOf<404 extends DefaultEntry['statusCode'] ? true : false>().toEqualTypeOf<false>()
    })

    it('exact code takes precedence over both range and default', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: {
          404: z.object({ notFound: z.boolean() }),
          '4xx': z.object({ error: z.string() }),
          default: z.object({ message: z.string() }),
        },
      })
      type Result = InferNonSseClientResponse<typeof contract>
      // Exact 404 entry is a literal statusCode — Extract works correctly here
      type At404 = Extract<Result, { statusCode: 404 }>
      expectTypeOf<At404>().toEqualTypeOf<{
        statusCode: 404
        headers: DefaultHeaders
        body: { notFound: boolean }
      }>()
      // The 4xx range entry excludes 404
      type RangeEntry = Extract<Result, { body: { error: string } }>
      expectTypeOf<404 extends RangeEntry['statusCode'] ? true : false>().toEqualTypeOf<false>()
      // The default entry excludes all 4xx codes (covered by range) and 404 (exact)
      type DefaultEntry = Extract<Result, { body: { message: string } }>
      expectTypeOf<400 extends DefaultEntry['statusCode'] ? true : false>().toEqualTypeOf<false>()
      expectTypeOf<404 extends DefaultEntry['statusCode'] ? true : false>().toEqualTypeOf<false>()
    })
  })

  describe('InferNonSseClientResponse with range keys and captureAsError', () => {
    it('2xx range response ends up in result type (extends SuccessfulHttpStatusCode)', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { '2xx': z.object({ ok: z.boolean() }) },
      })
      type Response = InferNonSseClientResponse<typeof contract>
      // The statusCode must be SuccessfulHttpStatusCode so Extract works with captureAsError
      type SuccessPart = Extract<Response, { statusCode: SuccessfulHttpStatusCode }>
      expectTypeOf<SuccessPart>().not.toEqualTypeOf<never>()
    })

    it('4xx range response ends up in error type (not SuccessfulHttpStatusCode)', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/test',
        responsesByStatusCode: { '4xx': z.object({ error: z.string() }) },
      })
      type Response = InferNonSseClientResponse<typeof contract>
      type SuccessPart = Extract<Response, { statusCode: SuccessfulHttpStatusCode }>
      expectTypeOf<SuccessPart>().toEqualTypeOf<never>()
    })
  })

  describe('InferSseClientResponse with range keys', () => {
    it('maps 2xx SSE range to AsyncIterable body for success codes', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          '2xx': sseResponse({ tick: z.object({ count: z.number() }) }),
        },
      })
      type Result = InferSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: SuccessfulHttpStatusCode
        headers: DefaultHeaders
        body: AsyncIterable<{
          type: 'tick'
          data: { count: number }
          lastEventId: string
          retry: number | undefined
        }>
      }>()
    })
  })
})
