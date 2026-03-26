import {
  anyOfResponses,
  blobResponse,
  ContractNoBody,
  defineRouteContract,
  sseResponse,
  textResponse,
} from '@lokalise/api-contracts'
import { getLocal } from 'mockttp'
import type { Client } from 'undici'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { JSON_HEADERS } from './constants.ts'
import { buildClient } from './httpClient.ts'
// @ts-expect-error
import mockProduct1 from './mock-data/mockProduct1.json'
import { sendByRouteContract } from './sendByRouteContract.ts'

describe('sendByRouteContract', () => {
  const mockServer = getLocal()
  let client: Client

  beforeEach(async () => {
    await mockServer.start()
    client = buildClient(mockServer.url)
  })

  afterEach(async () => {
    await client.close()
    await mockServer.stop()
  })

  describe('GET', () => {
    it('sends GET request and returns typed body', async () => {
      const responseSchema = z.object({ id: z.number(), title: z.string() })

      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responseSchemasByStatusCode: { 200: responseSchema },
      })

      await mockServer
        .forGet('/products/1')
        .thenJson(200, { id: 1, title: 'Backpack' }, JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        {},
        { requestLabel: 'test', validateResponse: true, throwOnError: true },
      )

      expectTypeOf(result.result.body).toEqualTypeOf<{ id: number; title: string }>()
      expect(result.result.body).toEqual({ id: 1, title: 'Backpack' })
    })

    it('sends GET request with path params', async () => {
      const contract = defineRouteContract({
        method: 'get',
        requestPathParamsSchema: z.object({ productId: z.coerce.number() }),
        pathResolver: ({ productId }) => `/products/${productId}`,
        responseSchemasByStatusCode: { 200: z.unknown() },
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        { pathParams: { productId: 1 } },
        { requestLabel: 'test', throwOnError: true },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('sends GET request with query params', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products',
        requestQuerySchema: z.object({ limit: z.number() }),
        responseSchemasByStatusCode: { 200: z.unknown() },
      })

      await mockServer
        .forGet('/products')
        .withQuery({ limit: '3' })
        .thenJson(200, [{ id: 1 }], JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        { queryParams: { limit: 3 } },
        { requestLabel: 'test', throwOnError: true },
      )

      expect(result.result.body).toEqual([{ id: 1 }])
    })

    it('sends GET request with headers', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products/1',
        requestHeaderSchema: z.object({ authorization: z.string() }),
        responseSchemasByStatusCode: { 200: z.unknown() },
      })

      await mockServer
        .forGet('/products/1')
        .withHeaders({ authorization: 'Bearer token' })
        .thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        { headers: { authorization: 'Bearer token' } },
        { requestLabel: 'test', throwOnError: true },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('works with path prefix', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responseSchemasByStatusCode: { 200: z.unknown() },
      })

      await mockServer.forGet('/api/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        { pathPrefix: 'api' },
        { requestLabel: 'test', throwOnError: true },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('validates response and throws on schema mismatch', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      await expect(
        sendByRouteContract(client, contract, {}, { requestLabel: 'test', validateResponse: true }),
      ).rejects.toThrow()
    })

    it('throws on error response when throwOnError is true', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responseSchemasByStatusCode: {},
      })

      await mockServer.forGet('/products/1').thenJson(500, { error: 'fail' }, JSON_HEADERS)

      await expect(
        sendByRouteContract(client, contract, {}, { requestLabel: 'test', throwOnError: true }),
      ).rejects.toMatchObject({ message: 'Response status code 500' })
    })
  })

  describe('POST', () => {
    it('sends POST request with body and returns typed response', async () => {
      const responseSchema = z.object({ id: z.number() })
      const bodySchema = z.object({ name: z.string() })

      const contract = defineRouteContract({
        method: 'post',
        pathResolver: () => '/products',
        requestBodySchema: bodySchema,
        responseSchemasByStatusCode: { 201: responseSchema },
      })

      await mockServer.forPost('/products').thenJson(201, { id: 21 }, JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        { body: { name: 'test' } },
        { requestLabel: 'test', validateResponse: true, throwOnError: true },
      )

      expectTypeOf(result.result.body).toEqualTypeOf<{ id: number }>()
      expect(result.result.body).toEqual({ id: 21 })
    })

    it('sends POST with path params and body', async () => {
      const contract = defineRouteContract({
        method: 'post',
        requestPathParamsSchema: z.object({ orgId: z.string() }),
        pathResolver: ({ orgId }) => `/orgs/${orgId}/members`,
        requestBodySchema: z.object({ email: z.string() }),
        responseSchemasByStatusCode: { 201: z.object({ id: z.string() }) },
      })

      await mockServer.forPost('/orgs/acme/members').thenJson(201, { id: '1' }, JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        { pathParams: { orgId: 'acme' }, body: { email: 'alice@example.com' } },
        { requestLabel: 'test', throwOnError: true },
      )

      expect(result.result.body).toEqual({ id: '1' })
    })
  })

  describe('PUT', () => {
    it('sends PUT request', async () => {
      const contract = defineRouteContract({
        method: 'put',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        requestBodySchema: z.object({ name: z.string() }),
        responseSchemasByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer.forPut('/products/1').thenJson(200, { id: 1 }, JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        { pathParams: { id: '1' }, body: { name: 'updated' } },
        { requestLabel: 'test', throwOnError: true, validateResponse: true },
      )

      expectTypeOf(result.result.body).toEqualTypeOf<{ id: number }>()
      expect(result.result.body).toEqual({ id: 1 })
    })
  })

  describe('PATCH', () => {
    it('sends PATCH request', async () => {
      const contract = defineRouteContract({
        method: 'patch',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        requestBodySchema: z.object({ name: z.string() }),
        responseSchemasByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer.forPatch('/products/1').thenJson(200, { id: 1 }, JSON_HEADERS)

      const result = await sendByRouteContract(
        client,
        contract,
        { pathParams: { id: '1' }, body: { name: 'patched' } },
        { requestLabel: 'test', throwOnError: true, validateResponse: true },
      )

      expectTypeOf(result.result.body).toEqualTypeOf<{ id: number }>()
      expect(result.result.body).toEqual({ id: 1 })
    })
  })

  describe('DELETE', () => {
    it('sends DELETE request with ContractNoBody and returns null on 204', async () => {
      const contract = defineRouteContract({
        method: 'delete',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        responseSchemasByStatusCode: { 204: ContractNoBody },
      })

      await mockServer.forDelete('/products/1').thenReply(204)

      const result = await sendByRouteContract(
        client,
        contract,
        { pathParams: { id: '1' } },
        { requestLabel: 'test', validateResponse: true },
      )

      expect(result.result.statusCode).toBe(204)
      expectTypeOf(result.result.body).toEqualTypeOf<null>()
      expect(result.result.body).toBeNull()
    })
  })

  describe('SSE', () => {
    it('returns async iterable of typed events', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/events',
        responseSchemasByStatusCode: {
          200: sseResponse({ update: z.object({ id: z.string() }) }),
        },
      })

      const sseBody = 'event: update\ndata: {"id":"1"}\n\nevent: update\ndata: {"id":"2"}\n\n'

      await mockServer
        .forGet('/events')
        .withHeaders({ accept: 'text/event-stream' })
        .thenReply(200, sseBody, { 'content-type': 'text/event-stream' })

      const stream = await sendByRouteContract(client, contract, {}, { requestLabel: 'test' })

      expectTypeOf(stream).toEqualTypeOf<AsyncIterable<{ event: 'update'; data: { id: string } }>>()

      const events: { event: string; data: { id: string } }[] = []
      for await (const event of stream) {
        events.push(event)
      }

      expect(events).toEqual([
        { event: 'update', data: { id: '1' } },
        { event: 'update', data: { id: '2' } },
      ])
    })

    it('validates event data against contract schema', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/events',
        responseSchemasByStatusCode: {
          200: sseResponse({ tick: z.object({ count: z.coerce.number() }) }),
        },
      })

      // count arrives as a string — coerce.number() should transform it
      const sseBody = 'event: tick\ndata: {"count":"42"}\n\n'

      await mockServer
        .forGet('/events')
        .withHeaders({ accept: 'text/event-stream' })
        .thenReply(200, sseBody, { 'content-type': 'text/event-stream' })

      const stream = await sendByRouteContract(client, contract, {}, { requestLabel: 'test' })

      const events: { event: string; data: { count: number } }[] = []
      for await (const event of stream) {
        events.push(event)
      }

      expect(events).toEqual([{ event: 'tick', data: { count: 42 } }])
    })

    it('dual-mode: streaming: true infers AsyncIterable, streaming: false infers typed body', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/events',
        responseSchemasByStatusCode: {
          200: anyOfResponses([
            sseResponse({ update: z.object({ id: z.string() }) }),
            z.object({ latest: z.string() }),
          ]),
        },
      })

      type SseResult = Awaited<
        ReturnType<() => ReturnType<typeof sendByRouteContract<typeof contract, true>>>
      >
      type JsonResult = Awaited<
        ReturnType<() => ReturnType<typeof sendByRouteContract<typeof contract, false>>>
      >

      expectTypeOf<SseResult>().toEqualTypeOf<
        AsyncIterable<{ event: 'update'; data: { id: string } }>
      >()
      expectTypeOf<JsonResult['result']['body']>().toEqualTypeOf<{ latest: string }>()
    })

    it('throws when event data fails schema validation', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/events',
        responseSchemasByStatusCode: {
          200: sseResponse({ update: z.object({ id: z.string() }) }),
        },
      })

      const sseBody = 'event: update\ndata: {"id":123}\n\n'

      await mockServer
        .forGet('/events')
        .withHeaders({ accept: 'text/event-stream' })
        .thenReply(200, sseBody, { 'content-type': 'text/event-stream' })

      const stream = await sendByRouteContract(client, contract, {}, { requestLabel: 'test' })

      await expect(async () => {
        for await (const _ of stream) {
          // consume
        }
      }).rejects.toThrow()
    })
  })

  describe('text', () => {
    it('returns string body for text response', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/export.csv',
        responseSchemasByStatusCode: { 200: textResponse('text/csv') },
      })

      await mockServer
        .forGet('/export.csv')
        .thenReply(200, 'id,name\n1,Backpack', { 'content-type': 'text/csv' })

      const result = await sendByRouteContract(
        client,
        contract,
        {},
        { requestLabel: 'test', throwOnError: true },
      )

      expectTypeOf(result.result.body).toEqualTypeOf<string>()
      expect(result.result.body).toBe('id,name\n1,Backpack')
    })
  })

  describe('blob', () => {
    it('returns Blob body for blob response', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/photo.png',
        responseSchemasByStatusCode: { 200: blobResponse('image/png') },
      })

      const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])

      await mockServer
        .forGet('/photo.png')
        .thenReply(200, imageBytes, { 'content-type': 'image/png' })

      const result = await sendByRouteContract(
        client,
        contract,
        {},
        { requestLabel: 'test', throwOnError: true },
      )

      expectTypeOf(result.result.body).toEqualTypeOf<Blob>()
      expect(result.result.body).toBeInstanceOf(Blob)
      expect(result.result.body.size).toBe(4)
    })
  })
})
