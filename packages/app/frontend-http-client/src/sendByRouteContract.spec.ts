import { ContractNoBody, defineRouteContract } from '@lokalise/api-contracts'
import { getLocal } from 'mockttp'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import wretch from 'wretch'
import { z } from 'zod/v4'
import { sendByRouteContract } from './sendByRouteContract.ts'

const JSON_HEADERS = {
  'Content-Type': 'application/json',
}

describe('sendByRouteContract', () => {
  const mockServer = getLocal()

  beforeEach(async () => {
    await mockServer.start()
  })

  afterEach(async () => {
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

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, {})

      expectTypeOf(result).toEqualTypeOf<{ id: number; title: string }>()
      expect(result).toEqual({ id: 1, title: 'Backpack' })
    })

    it('sends GET with path params', async () => {
      const contract = defineRouteContract({
        method: 'get',
        requestPathParamsSchema: z.object({ productId: z.string() }),
        pathResolver: ({ productId }) => `/products/${productId}`,
        responseSchemasByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer.forGet('/products/42').thenJson(200, { id: 42 }, JSON_HEADERS)

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, {
        pathParams: { productId: '42' },
      })

      expect(result).toEqual({ id: 42 })
    })

    it('sends GET with query params', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products',
        requestQuerySchema: z.object({ limit: z.number() }),
        responseSchemasByStatusCode: { 200: z.array(z.unknown()) },
      })

      await mockServer
        .forGet('/products')
        .withQuery({ limit: '3' })
        .thenJson(200, [{ id: 1 }], JSON_HEADERS)

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, { queryParams: { limit: 3 } })

      expect(result).toEqual([{ id: 1 }])
    })

    it('sends GET with headers', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products/1',
        requestHeaderSchema: z.object({ authorization: z.string() }),
        responseSchemasByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer
        .forGet('/products/1')
        .withHeaders({ authorization: 'Bearer token' })
        .thenJson(200, { id: 1 }, JSON_HEADERS)

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, {
        headers: { authorization: 'Bearer token' },
      })

      expect(result).toEqual({ id: 1 })
    })

    it('sends GET with async headers function', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products/1',
        requestHeaderSchema: z.object({ authorization: z.string() }),
        responseSchemasByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer
        .forGet('/products/1')
        .withHeaders({ authorization: 'Bearer async-token' })
        .thenJson(200, { id: 1 }, JSON_HEADERS)

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, {
        headers: async () => ({ authorization: 'Bearer async-token' }),
      })

      expect(result).toEqual({ id: 1 })
    })

    it('works with path prefix', async () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products/1',
        responseSchemasByStatusCode: { 200: z.object({ id: z.number() }) },
      })

      await mockServer.forGet('/api/products/1').thenJson(200, { id: 1 }, JSON_HEADERS)

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, { pathPrefix: 'api' })

      expect(result).toEqual({ id: 1 })
    })

    it('body is absent from params type for GET contract', () => {
      const contract = defineRouteContract({
        method: 'get',
        pathResolver: () => '/products',
        responseSchemasByStatusCode: { 200: z.unknown() },
      })

      const _typeCheck = () => {
        // @ts-expect-error body should not be present for GET contract
        sendByRouteContract(wretch('http://localhost'), contract, { body: {} })
      }
      void _typeCheck
    })
  })

  describe('POST', () => {
    it('sends POST with body and returns typed response', async () => {
      const responseSchema = z.object({ id: z.number() })
      const bodySchema = z.object({ name: z.string() })

      const contract = defineRouteContract({
        method: 'post',
        pathResolver: () => '/products',
        requestBodySchema: bodySchema,
        responseSchemasByStatusCode: { 201: responseSchema },
      })

      await mockServer.forPost('/products').thenJson(201, { id: 21 }, JSON_HEADERS)

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, { body: { name: 'Widget' } })

      expectTypeOf(result).toEqualTypeOf<{ id: number }>()
      expect(result).toEqual({ id: 21 })
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

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, {
        pathParams: { orgId: 'acme' },
        body: { email: 'alice@example.com' },
      })

      expect(result).toEqual({ id: '1' })
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

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, {
        pathParams: { id: '1' },
        body: { name: 'updated' },
      })

      expectTypeOf(result).toEqualTypeOf<{ id: number }>()
      expect(result).toEqual({ id: 1 })
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

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, {
        pathParams: { id: '1' },
        body: { name: 'patched' },
      })

      expectTypeOf(result).toEqualTypeOf<{ id: number }>()
      expect(result).toEqual({ id: 1 })
    })
  })

  describe('DELETE', () => {
    it('sends DELETE with ContractNoBody and returns undefined on 204', async () => {
      const contract = defineRouteContract({
        method: 'delete',
        requestPathParamsSchema: z.object({ id: z.string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        responseSchemasByStatusCode: { 204: ContractNoBody },
      })

      await mockServer.forDelete('/products/1').thenReply(204)

      const client = wretch(mockServer.url)
      const result = await sendByRouteContract(client, contract, { pathParams: { id: '1' } })

      expectTypeOf(result).toEqualTypeOf<undefined>()
      expect(result).toBeNull()
    })

    it('body is absent from params type for DELETE contract', () => {
      const contract = defineRouteContract({
        method: 'delete',
        pathResolver: () => '/products/1',
        responseSchemasByStatusCode: { 204: ContractNoBody },
      })

      const _typeCheck = () => {
        // @ts-expect-error body should not be present for DELETE contract
        sendByRouteContract(wretch('http://localhost'), contract, { body: {} })
      }
      void _typeCheck
    })
  })
})
