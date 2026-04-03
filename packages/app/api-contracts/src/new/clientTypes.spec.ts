import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type {
  ClientRequestParams,
  HeadersParam,
  InferNonSseClientResponse,
  InferSseClientResponse,
} from './clientTypes.ts'
import { ContractNoBody } from './constants.ts'
import { anyOfResponses, blobResponse, sseResponse, textResponse } from './contractResponse.ts'
import { defineApiContract } from './defineApiContract.ts'

type DefaultHeaders = Record<string, string | undefined>

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
            body: AsyncIterable<{ event: 'update'; data: { id: string } }>
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
      type Result = InferSseClientResponse<typeof contract>
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200
        headers: DefaultHeaders
        body: AsyncIterable<{ event: 'tick'; data: { count: number } }>
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
        headers: { 'x-request-id': string } & Record<string, string | undefined>
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
        headers: Omit<Record<string, string | undefined>, 'x-request-id'> & {
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
        headers: Omit<Record<string, string | undefined>, 'x-retry-count'> & {
          'x-retry-count': number
        }
        body: { id: number }
      }>()
    })
  })
})
