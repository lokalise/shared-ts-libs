import type { Readable } from 'node:stream'
import { ContractNoBody, defineRouteContract } from '@lokalise/api-contracts'
import { getLocal, type Mockttp } from 'mockttp'
import type { Client } from 'undici'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest'
import { z } from 'zod/v4'
import { JSON_HEADERS } from './constants.ts'
import { buildClient } from './httpClient.ts'
// @ts-expect-error
import mockProduct1 from './mock-data/mockProduct1.json'
import {
  sendByRouteContract,
  sendByRouteContractWithStreamedResponse,
} from './sendByRouteContract.ts'

async function streamToString(stream: ReadableStream | NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString()
}

describe('sendByRouteContract', () => {
  let mockServer: Mockttp
  let client: Client

  beforeAll(async () => {
    mockServer = getLocal()
    await mockServer.start()
  })

  beforeEach(async () => {
    await mockServer.reset()
    client = buildClient(mockServer.url)
  })

  afterEach(async () => {
    await client.close()
  })

  afterAll(async () => {
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

      await mockServer.forPost('/products').thenJson(200, { id: 21 }, JSON_HEADERS)

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

      await mockServer.forPost('/orgs/acme/members').thenJson(200, { id: '1' }, JSON_HEADERS)

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
      expectTypeOf(result.result.body).toEqualTypeOf<undefined | null>()
      expect(result.result.body).toBeNull()
    })
  })
})
//
// describe('sendByRouteContractWithStreamedResponse', () => {
//   let mockServer: Mockttp
//   let client: Client
//
//   beforeAll(async () => {
//     mockServer = getLocal()
//     await mockServer.start()
//   })
//
//   beforeEach(async () => {
//     await mockServer.reset()
//     client = buildClient(mockServer.url)
//   })
//
//   afterEach(async () => {
//     await client.close()
//   })
//
//   afterAll(async () => {
//     await mockServer.stop()
//   })
//
//   it('returns a Readable stream', async () => {
//     const contract = defineRouteContract({
//       method: 'get',
//       pathResolver: () => '/products/1',
//     })
//
//     await mockServer
//       .forGet('/products/1')
//       .thenReply(200, JSON.stringify(mockProduct1), JSON_HEADERS)
//
//     const result = await sendByRouteContractWithStreamedResponse(
//       client,
//       contract,
//       {},
//       { requestLabel: 'test' },
//     )
//
//     expect(result.result.statusCode).toBe(200)
//     expectTypeOf(result.result.body).toEqualTypeOf<Readable>()
//     const body = await streamToString(result.result.body)
//     expect(JSON.parse(body)).toEqual(mockProduct1)
//   })
//
//   it('sends GET with path params and query params', async () => {
//     const contract = defineRouteContract({
//       method: 'get',
//       requestPathParamsSchema: z.object({ id: z.string() }),
//       pathResolver: ({ id }) => `/products/${id}`,
//       requestQuerySchema: z.object({ format: z.string() }),
//     })
//
//     await mockServer
//       .forGet('/products/1')
//       .withQuery({ format: 'json' })
//       .thenReply(200, JSON.stringify(mockProduct1), JSON_HEADERS)
//
//     const result = await sendByRouteContractWithStreamedResponse(
//       client,
//       contract,
//       { pathParams: { id: '1' }, queryParams: { format: 'json' } },
//       { requestLabel: 'test' },
//     )
//
//     const body = await streamToString(result.result.body)
//     expect(JSON.parse(body)).toEqual(mockProduct1)
//   })
//
//   it('throws on error response when throwOnError is true', async () => {
//     const contract = defineRouteContract({
//       method: 'get',
//       pathResolver: () => '/products/1',
//     })
//
//     await mockServer.forGet('/products/1').thenJson(500, { error: 'fail' }, JSON_HEADERS)
//
//     await expect(
//       sendByRouteContractWithStreamedResponse(
//         client,
//         contract,
//         {},
//         { requestLabel: 'test', throwOnError: true },
//       ),
//     ).rejects.toMatchObject({ message: 'Response status code 500' })
//   })
// })
