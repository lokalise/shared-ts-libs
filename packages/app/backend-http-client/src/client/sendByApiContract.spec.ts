import {
  anyOfResponses,
  blobResponse,
  ContractNoBody,
  defineApiContract,
  sseResponse,
  textResponse,
} from '@lokalise/api-contracts'
import { getLocal } from 'mockttp'
import type { Client } from 'undici'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { JSON_HEADERS } from './constants.ts'
import { buildClient } from './httpClient.ts'
import mockProduct1 from './mock-data/mockProduct1.json' with { type: 'json' }
import { sendByApiContract } from './sendByApiContract.ts'

describe('sendByApiContract', () => {
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

      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: responseSchema },
      })

      await mockServer
        .forGet('/products/1')
        .thenJson(200, { id: 1, title: 'Backpack' }, JSON_HEADERS)

      const result = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      expectTypeOf(result.result).toMatchTypeOf<
        { body: { id: number; title: string } } | undefined
      >()
      expect(result.result).toMatchObject({ body: { id: 1, title: 'Backpack' } })
    })

    it('sends GET request with path params', async () => {
      const contract = defineApiContract({
        method: 'get',
        requestPathParamsSchema: z.object({ productId: z.coerce.number() }),
        pathResolver: ({ productId }) => `/products/${productId}`,
        responsesByStatusCode: { 200: z.unknown() },
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByApiContract(
        client,
        contract,
        { pathParams: { productId: 1 } },
        { requestLabel: 'test' },
      )

      expect(result.result).toMatchObject({ body: mockProduct1 })
    })

    it('sends GET request with query params', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products',
        requestQuerySchema: z.object({ limit: z.number() }),
        responsesByStatusCode: { 200: z.unknown() },
      })

      await mockServer
        .forGet('/products')
        .withQuery({ limit: '3' })
        .thenJson(200, [{ id: 1 }], JSON_HEADERS)

      const result = await sendByApiContract(
        client,
        contract,
        { queryParams: { limit: 3 } },
        { requestLabel: 'test' },
      )

      expect(result.result).toMatchObject({ body: [{ id: 1 }] })
    })

    it('sends GET request with headers', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        requestHeaderSchema: z.object({ authorization: z.string() }),
        responsesByStatusCode: { 200: z.unknown() },
      })

      await mockServer
        .forGet('/products/1')
        .withHeaders({ authorization: 'Bearer token' })
        .thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByApiContract(
        client,
        contract,
        { headers: { authorization: 'Bearer token' } },
        { requestLabel: 'test' },
      )

      expect(result.result).toMatchObject({ body: mockProduct1 })
    })

    it('works with path prefix', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: z.unknown() },
      })

      await mockServer.forGet('/api/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByApiContract(
        client,
        contract,
        { pathPrefix: 'api' },
        { requestLabel: 'test' },
      )

      expect(result.result).toMatchObject({ body: mockProduct1 })
    })

    it('validates response and throws on schema mismatch', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: z.object({ id: z.string() }) },
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      await expect(
        sendByApiContract(client, contract, {}, { requestLabel: 'test' }),
      ).rejects.toThrow()
    })

    it('returns non-2xx response as Either.error by default', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: {},
      })

      await mockServer.forGet('/products/1').thenJson(500, { error: 'fail' }, JSON_HEADERS)

      const response = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      expect(response.error).toBeDefined()
      expect(response.result).toBeUndefined()
    })

    it('returns error in Either.error when status is not in contract', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: {
          200: z.object({ id: z.number() }),
        },
      })

      await mockServer.forGet('/products/1').thenJson(500, { error: 'fail' }, JSON_HEADERS)

      const response = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      expect(response.error).toBeDefined()
      expect(response.result).toBeUndefined()
    })
  })

  describe('POST', () => {
    it('sends POST request with body and returns typed response', async () => {
      const responseSchema = z.object({ id: z.number() })
      const bodySchema = z.object({ name: z.string() })

      const contract = defineApiContract({
        method: 'post',
        pathResolver: () => '/products',
        requestBodySchema: bodySchema,
        responsesByStatusCode: { 201: responseSchema },
      })

      await mockServer.forPost('/products').thenJson(201, { id: 21 }, JSON_HEADERS)

      const result = await sendByApiContract(
        client,
        contract,
        { body: { name: 'test' } },
        { requestLabel: 'test' },
      )

      expectTypeOf(result.result).toMatchTypeOf<{ body: { id: number } } | undefined>()
      expect(result.result).toMatchObject({ body: { id: 21 } })
    })

    it('sends POST with path params and body', async () => {
      const contract = defineApiContract({
        method: 'post',
        requestPathParamsSchema: z.object({ orgId: z.string() }),
        pathResolver: ({ orgId }) => `/orgs/${orgId}/members`,
        requestBodySchema: z.object({ email: z.string() }),
        responsesByStatusCode: { 201: z.object({ id: z.string() }) },
      })

      await mockServer.forPost('/orgs/acme/members').thenJson(201, { id: '1' }, JSON_HEADERS)

      const result = await sendByApiContract(
        client,
        contract,
        { pathParams: { orgId: 'acme' }, body: { email: 'alice@example.com' } },
        { requestLabel: 'test' },
      )

      expect(result.result).toMatchObject({ body: { id: '1' } })
    })
  })

  describe('PUT', () => {
    it('sends PUT request', async () => {
      const contract = defineApiContract({
        method: 'put',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        requestBodySchema: z.object({ name: z.string() }),
        responsesByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer.forPut('/products/1').thenJson(200, { id: 1 }, JSON_HEADERS)

      const result = await sendByApiContract(
        client,
        contract,
        { pathParams: { id: '1' }, body: { name: 'updated' } },
        { requestLabel: 'test' },
      )

      expectTypeOf(result.result).toMatchTypeOf<{ body: { id: number } } | undefined>()
      expect(result.result).toMatchObject({ body: { id: 1 } })
    })
  })

  describe('PATCH', () => {
    it('sends PATCH request', async () => {
      const contract = defineApiContract({
        method: 'patch',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        requestBodySchema: z.object({ name: z.string() }),
        responsesByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer.forPatch('/products/1').thenJson(200, { id: 1 }, JSON_HEADERS)

      const result = await sendByApiContract(
        client,
        contract,
        { pathParams: { id: '1' }, body: { name: 'patched' } },
        { requestLabel: 'test' },
      )

      expectTypeOf(result.result).toMatchTypeOf<{ body: { id: number } } | undefined>()
      expect(result.result).toMatchObject({ body: { id: 1 } })
    })
  })

  describe('DELETE', () => {
    it('sends DELETE request with ContractNoBody and returns null on 204', async () => {
      const contract = defineApiContract({
        method: 'delete',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        responsesByStatusCode: { 204: ContractNoBody },
      })

      await mockServer.forDelete('/products/1').thenReply(204)

      const result = await sendByApiContract(
        client,
        contract,
        { pathParams: { id: '1' } },
        { requestLabel: 'test' },
      )

      expectTypeOf(result.result).toMatchTypeOf<{ body: null } | undefined>()
      expect(result.result).toMatchObject({ statusCode: 204, body: null })
    })
  })

  describe('SSE', () => {
    it('returns async iterable of typed events', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: sseResponse({ update: z.object({ id: z.string() }) }),
        },
      })

      const sseBody = 'event: update\ndata: {"id":"1"}\n\nevent: update\ndata: {"id":"2"}\n\n'

      await mockServer
        .forGet('/events')
        .withHeaders({ accept: 'text/event-stream' })
        .thenReply(200, sseBody, { 'content-type': 'text/event-stream' })

      const response = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      expectTypeOf(response.result).toMatchTypeOf<
        { body: AsyncIterable<{ event: 'update'; data: { id: string } }> } | undefined
      >()

      if (!response.result) throw new Error('Expected result')
      const events: { event: string; data: { id: string } }[] = []
      for await (const event of response.result.body) {
        events.push(event)
      }

      expect(events).toEqual([
        { event: 'update', data: { id: '1' } },
        { event: 'update', data: { id: '2' } },
      ])
    })

    it('validates event data against contract schema', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: sseResponse({ tick: z.object({ count: z.coerce.number() }) }),
        },
      })

      // count arrives as a string — coerce.number() should transform it
      const sseBody = 'event: tick\ndata: {"count":"42"}\n\n'

      await mockServer
        .forGet('/events')
        .withHeaders({ accept: 'text/event-stream' })
        .thenReply(200, sseBody, { 'content-type': 'text/event-stream' })

      const response = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      if (!response.result) throw new Error('Expected result')
      const events: { event: string; data: { count: number } }[] = []
      for await (const event of response.result.body) {
        events.push(event)
      }

      expect(events).toEqual([{ event: 'tick', data: { count: 42 } }])
    })

    it('dual-mode: streaming: true infers AsyncIterable, streaming: false infers typed body', () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: anyOfResponses([
            sseResponse({ update: z.object({ id: z.string() }) }),
            z.object({ latest: z.string() }),
          ]),
        },
      })

      type SseResult = Awaited<
        ReturnType<() => ReturnType<typeof sendByApiContract<typeof contract, true>>>
      >
      type JsonResult = Awaited<
        ReturnType<() => ReturnType<typeof sendByApiContract<typeof contract, false>>>
      >

      expectTypeOf<NonNullable<SseResult['result']>['body']>().toEqualTypeOf<
        AsyncIterable<{ event: 'update'; data: { id: string } }>
      >()
      expectTypeOf<NonNullable<JsonResult['result']>['body']>().toEqualTypeOf<{ latest: string }>()
    })

    it('throws when event data fails schema validation', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/events',
        responsesByStatusCode: {
          200: sseResponse({ update: z.object({ id: z.string() }) }),
        },
      })

      const sseBody = 'event: update\ndata: {"id":123}\n\n'

      await mockServer
        .forGet('/events')
        .withHeaders({ accept: 'text/event-stream' })
        .thenReply(200, sseBody, { 'content-type': 'text/event-stream' })

      const response = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      if (!response.result) throw new Error('Expected result')
      const resultBody = response.result.body

      await expect(async () => {
        for await (const _ of resultBody) {
          // consume
        }
      }).rejects.toThrow()
    })
  })

  describe('text', () => {
    it('returns string body for text response', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/export.csv',
        responsesByStatusCode: { 200: textResponse('text/csv') },
      })

      await mockServer
        .forGet('/export.csv')
        .thenReply(200, 'id,name\n1,Backpack', { 'content-type': 'text/csv' })

      const result = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      expectTypeOf(result.result).toMatchTypeOf<{ body: string } | undefined>()
      expect(result.result).toMatchObject({ body: 'id,name\n1,Backpack' })
    })
  })

  describe('blob', () => {
    it('returns Blob body for blob response', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/photo.png',
        responsesByStatusCode: { 200: blobResponse('image/png') },
      })

      const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])

      await mockServer
        .forGet('/photo.png')
        .thenReply(200, imageBytes, { 'content-type': 'image/png' })

      const result = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      expectTypeOf(result.result).toMatchTypeOf<{ body: Blob } | undefined>()
      expect(result.result?.body).toBeInstanceOf(Blob)
      expect(result.result?.body.size).toBe(4)
    })
  })

  describe('request errors', () => {
    it('returns connection error as Either.error when server closes the connection', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer.forGet('/products/1').thenCloseConnection()

      const result = await sendByApiContract(client, contract, {}, { requestLabel: 'test' })

      expect(result).toEqual({
        error: expect.objectContaining({
          code: 'UND_ERR_SOCKET',
        }),
      })
    })

    it('returns network error as Either.error when request is aborted', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      const result = await sendByApiContract(
        client,
        contract,
        {},
        { requestLabel: 'test', signal: AbortSignal.abort() },
      )

      expect(result).toEqual({
        error: expect.objectContaining({
          name: 'AbortError',
        }),
      })
    })
  })

  describe('retry', () => {
    it('retries on configured status codes and returns success on recovery', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      let callCount = 0
      await mockServer.forGet('/products/1').thenCallback(() => {
        callCount++
        if (callCount === 1) {
          return { statusCode: 503, headers: JSON_HEADERS, body: '{}' }
        }
        return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ id: 1 }) }
      })

      const result = await sendByApiContract(
        client,
        contract,
        {},
        {
          requestLabel: 'test',
          retryConfig: { maxAttempts: 2, statusCodesToRetry: [503], retryOnTimeout: false },
        },
      )

      expect(callCount).toBe(2)
      expect(result.result).toMatchObject({ statusCode: 200, body: { id: 1 } })
    })

    it('returns error after exhausting all retries', async () => {
      const contract = defineApiContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responsesByStatusCode: {},
      })

      let callCount = 0
      await mockServer.forGet('/products/1').thenCallback(() => {
        callCount++
        return { statusCode: 503, headers: JSON_HEADERS, body: '{}' }
      })

      const result = await sendByApiContract(
        client,
        contract,
        {},
        {
          requestLabel: 'test',
          retryConfig: {
            maxAttempts: 2,
            statusCodesToRetry: [503],
            retryOnTimeout: false,
            delayResolver(_, attemptNumber) {
              return attemptNumber < 2 ? 1 : -1
            },
          },
        },
      )

      expect(callCount).toBe(2)
      expect(result.error).toMatchObject({ message: 'Could not map response' })
      expect(result.result).toBeUndefined()
    })
  })
})
