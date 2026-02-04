import { setTimeout } from 'node:timers/promises'
import { buildDeleteRoute, buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import { getLocal, type Mockttp } from 'mockttp'
import { Client } from 'undici'
import { createDefaultRetryResolver } from 'undici-retry'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { JSON_HEADERS } from './constants.ts'
import {
  buildClient,
  sendByDeleteRoute,
  sendByGetRoute,
  sendByGetRouteWithStreamedResponse,
  sendByPayloadRoute,
  sendDelete,
  sendGet,
  sendGetWithStreamedResponse,
  sendPatch,
  sendPost,
  sendPostBinary,
  sendPut,
  sendPutBinary,
} from './httpClient.ts'
// @ts-expect-error
import mockProduct1 from './mock-data/mockProduct1.json'
// @ts-expect-error
import mockProductsLimit3 from './mock-data/mockProductsLimit3.json'
import { type HttpRequestContext, isInternalRequestError } from './types.ts'

const TEXT_HEADERS = {
  'content-type': 'text/plain',
}

const reqContext: HttpRequestContext = {
  reqId: 'dummyId',
}

const UNKNOWN_RESPONSE_SCHEMA = z.unknown()

async function streamToString(stream: ReadableStream | NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString()
}

describe('httpClient', () => {
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

  afterAll(async () => {
    await mockServer.stop()
  })

  describe('buildClient', () => {
    it('creates a client', () => {
      const testClient = buildClient(mockServer.url)
      expect(testClient).toBeInstanceOf(Client)
    })
  })

  describe('GET', () => {
    it('validates response structure with provided schema, throws an error', async () => {
      const schema = z.object({
        id: z.string(),
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      await expect(
        sendGet(client, '/products/1', {
          responseSchema: schema,
          reqContext,
          requestLabel: 'dummy',
          validateResponse: true,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "id"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
      `)
    })

    it('validates response structure with provided schema, passes validation', async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendGet(client, '/products/1', {
        responseSchema: schema,
        requestLabel: 'dummy',
        validateResponse: true,
      })

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('validates response structure with provided schema, skips validation', async () => {
      const schema = z.object({
        id: z.string(),
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendGet(client, '/products/1', {
        responseSchema: schema,
        requestLabel: 'dummy',
        validateResponse: false,
      })

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('unexpected 204, with validation', async () => {
      await mockServer.forGet('/products/1').thenReply(204)

      await expect(
        sendGet(client, '/products/1', {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: true,
        }),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('unexpected 204, without validation', async () => {
      await mockServer.forGet('/products/1').thenReply(204)

      const result = await sendGet(client, '/products/1', {
        responseSchema: z.number(),
        requestLabel: 'dummy',
        validateResponse: false,
      })

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBe('')
    })

    it('expected 204', async () => {
      await mockServer.forGet('/products/1').thenReply(204)

      const result = await sendGet(client, '/products/1', {
        responseSchema: z.number(),
        requestLabel: 'dummy',
        isEmptyResponseExpected: true,
        validateResponse: true,
      })

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })

    it('returns original payload when breaking during parsing and throw on error is true', async () => {
      expect.assertions(1)
      await mockServer.forGet('/products/1').thenReply(200, 'this is not a real json', JSON_HEADERS)

      try {
        await sendGet(client, '/products/1', {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          throwOnError: true,
          safeParseJson: true,
          requestLabel: 'label',
        })
      } catch (err) {
        // This is needed, because built-in error assertions do not assert nested fields
        // eslint-disable-next-line vitest/no-conditional-expect
        expect(err).toMatchObject({
          message: 'Error while parsing HTTP JSON response',
          errorCode: 'INVALID_HTTP_RESPONSE_JSON',
          details: {
            rawBody: 'this is not a real json',
            requestLabel: 'label',
          },
        })
      }
    })

    it('does not throw if broken during parsing but throwOnError is false', async () => {
      expect.assertions(1)
      await mockServer.forGet('/products/1').thenReply(200, 'this is not a real json', JSON_HEADERS)

      const result = await sendGet(client, '/products/1', {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        throwOnError: false,
        safeParseJson: true,
        requestLabel: 'label',
      })

      expect(result.error).toMatchObject({
        message: 'Error while parsing HTTP JSON response',
        errorCode: 'INVALID_HTTP_RESPONSE_JSON',
        details: {
          rawBody: 'this is not a real json',
          requestLabel: 'label',
        },
      })
    })

    it('GET without queryParams', async () => {
      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendGet(client, '/products/1', {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('GET returning text', async () => {
      await mockServer.forGet('/products/1').thenReply(200, 'just text', TEXT_HEADERS)

      const result = await sendGet(client, '/products/1', {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toBe('just text')
    })

    it('GET returning text without content type', async () => {
      await mockServer.forGet('/products/1').thenReply(200, 'just text')

      const result = await sendGet(client, '/products/1', {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toBe('just text')
    })

    it('GET with queryParams', async () => {
      const query = {
        limit: 3,
      }

      await mockServer
        .forGet('/products')
        .withQuery({ limit: '3' })
        .thenJson(200, mockProductsLimit3, JSON_HEADERS)

      const result = await sendGet(client, '/products', {
        query,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual(mockProductsLimit3)
    })

    it('Returns internal error when configured not to throw', async () => {
      const query = {
        limit: 3,
      }

      await mockServer.forGet('/products').withQuery({ limit: '3' }).thenCloseConnection()

      const result = await sendGet(client, '/products', {
        query,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
        throwOnError: false,
      })

      expect(result.result).toBeUndefined()
      expect(isInternalRequestError(result.error)).toBe(true)
    })

    it('Throws an error on internal error', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      await mockServer.forGet('/products').withQuery({ limit: '3' }).thenCloseConnection()

      await expect(
        sendGet(client, '/products', {
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('other side closed'),
      })
    })

    it('Throws an error with a label on internal error', async () => {
      expect.assertions(2)
      const query = {
        limit: 3,
      }

      try {
        await sendGet(buildClient('http://127.0.0.1:999'), '/dummy', {
          requestLabel: 'label',
          throwOnError: true,
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        })
      } catch (err) {
        if (!isInternalRequestError(err)) {
          throw new Error('Invalid error type')
        }
        expect(err.message).toBe('connect ECONNREFUSED 127.0.0.1:999')
        expect(err.requestLabel).toBe('label')
      }
    })

    it('Returns error response', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      await mockServer
        .forGet('/products')
        .withQuery({ limit: '3' })
        .thenReply(400, 'Invalid request')

      await expect(
        sendGet(client, '/products', {
          query,
          requestLabel: 'label',
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        }),
      ).rejects.toMatchObject({
        message: 'Response status code 400',
        response: {
          body: 'Invalid request',
          statusCode: 400,
        },
        details: {
          requestLabel: 'label',
          response: {
            body: 'Invalid request',
            statusCode: 400,
          },
        },
      })
    })

    it('Works with retry', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      let requestCount = 0
      await mockServer
        .forGet('/products')
        .withQuery({ limit: '3' })
        .thenCallback(() => {
          requestCount++
          if (requestCount === 1) {
            return { statusCode: 500, body: 'Invalid request' }
          }
          return { statusCode: 200, body: 'OK' }
        })

      const response = await sendGet(client, '/products', {
        query,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
        retryConfig: {
          statusCodesToRetry: [500],
          retryOnTimeout: false,
          delayResolver: createDefaultRetryResolver({
            baseDelay: 0,
            maxDelay: 0,
          }),
          maxAttempts: 2,
        },
      })

      expect(response.result.body).toBe('OK')
    })
  })

  describe('sendByGetRoute', () => {
    it('validates response structure with provided schema, throws an error', async () => {
      const schema = z.object({
        id: z.string(),
      })
      const apiContract = buildGetRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      await expect(
        sendByGetRoute(
          client,
          apiContract,
          {},
          {
            validateResponse: true,
            requestLabel: 'Test request',
          },
        ),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "id"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
      `)
    })

    it('validates response structure with provided schema, passes validation', async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      })

      const apiContract = buildGetRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByGetRoute(
        client,
        apiContract,
        {},
        {
          validateResponse: true,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('validates response structure with provided schema, skips validation', async () => {
      const schema = z.object({
        id: z.string(),
      })
      const apiContract = buildGetRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByGetRoute(
        client,
        apiContract,
        {},
        {
          validateResponse: false,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('unexpected 204, with validation', async () => {
      const apiContract = buildGetRoute({
        successResponseBodySchema: z.number(),
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forGet('/products/1').thenReply(204)

      await expect(
        sendByGetRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: true,
          },
        ),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('unexpected 204, with validation, without schema', async () => {
      //@ts-expect-error - testing missing param
      const apiContract = buildGetRoute({
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forGet('/products/1').thenReply(204)

      await expect(
        sendByGetRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: true,
          },
        ),
      ).rejects.toMatchInlineSnapshot(
        '[Error: Response validation schema not set for request dummy]',
      )
    })

    it('expected 204', async () => {
      const apiContract = buildGetRoute({
        successResponseBodySchema: z.undefined(),
        requestPathParamsSchema: z.undefined(),
        isEmptyResponseExpected: true,
        pathResolver: () => '/products/1',
      })

      await mockServer.forGet('/products/1').thenReply(204)

      const result = await sendByGetRoute(
        client,
        apiContract,
        {},
        {
          requestLabel: 'dummy',
          validateResponse: true,
        },
      )

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })

    it('works with path prefix', async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      })

      const apiContract = buildGetRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forGet('/resources/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByGetRoute(
        client,
        apiContract,
        {
          pathPrefix: 'resources',
        },
        {
          validateResponse: true,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })
  })

  describe('DELETE', () => {
    it('DELETE without queryParams', async () => {
      await mockServer.forDelete('/products/1').thenReply(200)

      const result = await sendDelete(client, '/products/1', {
        reqContext,
        responseSchema: z.unknown(),
        requestLabel: 'dummy',
        validateResponse: true,
      })

      expect(result.result.statusCode).toBe(200)
      expect(result.result.body).toBe('')
    })

    it('DELETE with queryParams', async () => {
      const query = {
        limit: 3,
      }

      await mockServer.forDelete('/products').withQuery({ limit: '3' }).thenReply(200)

      const result = await sendDelete(client, '/products', {
        query,
        responseSchema: z.unknown(),
        requestLabel: 'dummy',
      })

      expect(result.result.statusCode).toBe(200)
      expect(result.result.body).toBe('')
    })

    it('Throws an error on internal error', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      await mockServer.forDelete('/products').withQuery({ limit: '3' }).thenCloseConnection()

      await expect(
        sendDelete(client, '/products', {
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('other side closed'),
      })
    })

    it('unexpected 204, with validation', async () => {
      await mockServer.forDelete('/products/1').thenReply(204)

      await expect(
        sendDelete(client, '/products/1', {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: true,
          isEmptyResponseExpected: false,
        }),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('unexpected 204, without validation', async () => {
      await mockServer.forDelete('/products/1').thenReply(204)

      const result = await sendDelete(client, '/products/1', {
        responseSchema: z.number(),
        requestLabel: 'dummy',
        validateResponse: false,
        isEmptyResponseExpected: false,
      })

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBe('')
    })

    it('expected 204', async () => {
      await mockServer.forDelete('/products/1').thenReply(204)

      const result = await sendDelete(client, '/products/1', {
        responseSchema: z.number(),
        requestLabel: 'dummy',
        validateResponse: true,
      })

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })
  })

  describe('sendByDeleteRoute', () => {
    it('validates response structure with provided schema, throws an error', async () => {
      const schema = z.object({
        id: z.string(),
      })
      const apiContract = buildDeleteRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forDelete('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      await expect(
        sendByDeleteRoute(
          client,
          apiContract,
          {},
          {
            validateResponse: true,
            requestLabel: 'Test request',
          },
        ),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "id"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
      `)
    })

    it('validates response structure with provided schema, passes validation', async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      })

      const apiContract = buildDeleteRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forDelete('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByDeleteRoute(
        client,
        apiContract,
        {},
        {
          validateResponse: true,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('validates response structure with provided schema, skips validation', async () => {
      const schema = z.object({
        id: z.string(),
      })
      const apiContract = buildDeleteRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forDelete('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByDeleteRoute(
        client,
        apiContract,
        {},
        {
          validateResponse: false,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('expected 204', async () => {
      const apiContract = buildDeleteRoute({
        successResponseBodySchema: z.undefined(),
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forDelete('/products/1').thenReply(204)

      const result = await sendByDeleteRoute(
        client,
        apiContract,
        {},
        {
          requestLabel: 'dummy',
          validateResponse: true,
        },
      )

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })

    it('unexpected 204, with validation', async () => {
      const apiContract = buildDeleteRoute({
        isEmptyResponseExpected: false,
        successResponseBodySchema: z.number(),
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forDelete('/products/1').thenReply(204)

      await expect(
        sendByDeleteRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: true,
          },
        ),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('works with path prefix', async () => {
      const schema = z.object({
        id: z.number(),
      })

      const apiContract = buildDeleteRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forDelete('/resources/products/1').thenJson(200, { id: 1 }, JSON_HEADERS)

      const result = await sendByDeleteRoute(
        client,
        apiContract,
        {
          pathPrefix: 'resources/',
        },
        {
          validateResponse: true,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual({ id: 1 })
    })
  })

  describe('sendByPayloadRoute', () => {
    it('validates response structure with provided schema, throws an error', async () => {
      const schema = z.object({
        id: z.string(),
      })
      const apiContract = buildPayloadRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        method: 'post',
        requestBodySchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      await expect(
        sendByPayloadRoute(
          client,
          apiContract,
          {},
          {
            validateResponse: true,
            requestLabel: 'Test request',
          },
        ),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "id"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
      `)
    })

    it('validates response structure with provided schema, passes validation', async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      })

      const apiContract = buildPayloadRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        method: 'post',
        requestBodySchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByPayloadRoute(
        client,
        apiContract,
        {},
        {
          validateResponse: true,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('validates response structure with provided schema, skips validation', async () => {
      const schema = z.object({
        id: z.string(),
      })
      const apiContract = buildPayloadRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        method: 'post',
        requestBodySchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendByPayloadRoute(
        client,
        apiContract,
        {},
        {
          validateResponse: false,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('works with path prefix', async () => {
      const schema = z.object({
        id: z.number(),
      })

      const apiContract = buildPayloadRoute({
        successResponseBodySchema: schema,
        requestPathParamsSchema: z.undefined(),
        method: 'post',
        requestBodySchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forPost('/resources/products/1').thenJson(200, { id: 1 }, JSON_HEADERS)

      const result = await sendByPayloadRoute(
        client,
        apiContract,
        {
          pathPrefix: '/resources/',
        },
        {
          validateResponse: true,
          throwOnError: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual({ id: 1 })
    })
  })

  describe('POST', () => {
    it('validates response structure with provided schema, throws an error', async () => {
      const schema = z.object({
        id: z.string(),
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      await expect(
        sendPost(
          client,
          '/products/1',
          {},
          {
            responseSchema: schema,
            validateResponse: true,
            requestLabel: 'Test request',
          },
        ),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "id"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
      `)
    })

    it('validates response structure with provided schema, passes validation', async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendPost(
        client,
        '/products/1',
        {},
        {
          responseSchema: schema,
          validateResponse: true,
          requestLabel: 'dummy',
          reqContext,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('validates response structure with provided schema, skips validation', async () => {
      const schema = z.object({
        id: z.string(),
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendPost(
        client,
        '/products/1',
        {},
        {
          responseSchema: schema,
          requestLabel: 'dummy',
          validateResponse: false,
        },
      )

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('unexpected 204, with validation', async () => {
      await mockServer.forPost('/products/1').thenReply(204)

      await expect(
        sendPost(
          client,
          '/products/1',
          {},
          {
            responseSchema: z.number(),
            requestLabel: 'dummy',
            validateResponse: true,
          },
        ),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('unexpected 204, without validation', async () => {
      await mockServer.forPost('/products/1').thenReply(204)

      const result = await sendPost(
        client,
        '/products/1',
        {},
        {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: false,
        },
      )

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBe('')
    })

    it('expected 204', async () => {
      await mockServer.forPost('/products/1').thenReply(204)

      const result = await sendPost(
        client,
        '/products/1',
        {},
        {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: true,
          isEmptyResponseExpected: true,
        },
      )

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })

    it('POST without queryParams', async () => {
      await mockServer.forPost('/products').thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPost(client, '/products', mockProduct1, {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('POST without body', async () => {
      await mockServer.forPost('/products').thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPost(client, '/products', undefined, {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('POST with queryParams', async () => {
      const query = {
        limit: 3,
      }

      await mockServer
        .forPost('/products')
        .withQuery({ limit: '3' })
        .thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPost(client, '/products', mockProduct1, {
        query,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('POST that returns 400 throws an error', async () => {
      await mockServer.forPost('/products').thenJson(400, { errorCode: 'err' }, JSON_HEADERS)

      await expect(
        sendPost(client, '/products', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toThrow('Response status code 400')
    })

    it('Throws an error on internal error', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      await mockServer.forPost('/products').withQuery({ limit: '3' }).thenCloseConnection()

      await expect(
        sendPost(client, '/products', undefined, {
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('other side closed'),
      })
    })
  })

  describe('POST binary', () => {
    it('validates response structure with provided schema, throws an error', async () => {
      const schema = z.object({
        id: z.string(),
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      await expect(
        sendPostBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
          responseSchema: schema,
          validateResponse: true,
          requestLabel: 'dummy',
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "id"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
      `)
    })

    it('validates response structure with provided schema, passes validation', async () => {
      const schema = z.object({
        category: z.string(),
        description: z.string(),
        id: z.number(),
        image: z.string(),
        price: z.number(),
        rating: z.object({
          count: z.number(),
          rate: z.number(),
        }),
        title: z.string(),
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendPostBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
        responseSchema: schema,
        validateResponse: true,
        requestLabel: 'dummy',
        reqContext,
      })

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('validates response structure with provided schema, skips validation', async () => {
      const schema = z.object({
        id: z.string(),
      })

      await mockServer.forPost('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

      const result = await sendPostBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
        responseSchema: schema,
        requestLabel: 'dummy',
        validateResponse: false,
      })

      expect(result.result.body).toEqual(mockProduct1)
    })

    it('unexpected 204, with validation', async () => {
      await mockServer.forPost('/products/1').thenReply(204)

      await expect(
        sendPostBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: true,
        }),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('unexpected 204, without validation', async () => {
      await mockServer.forPost('/products/1').thenReply(204)

      const result = await sendPostBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
        responseSchema: z.number(),
        requestLabel: 'dummy',
        validateResponse: false,
      })

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBe('')
    })

    it('expected 204', async () => {
      await mockServer.forPost('/products/1').thenReply(204)

      const result = await sendPostBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
        responseSchema: z.number(),
        requestLabel: 'dummy',
        validateResponse: true,
        isEmptyResponseExpected: true,
      })

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })

    it('POST without queryParams', async () => {
      await mockServer.forPost('/products').thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPostBinary(
        client,
        '/products',
        Buffer.from(JSON.stringify(mockProduct1)),
        {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        },
      )

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('POST with queryParams', async () => {
      const query = {
        limit: 3,
      }

      await mockServer
        .forPost('/products')
        .withQuery({ limit: '3' })
        .thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPostBinary(
        client,
        '/products',
        Buffer.from(JSON.stringify(mockProduct1)),
        {
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        },
      )

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('POST that returns 400 throws an error', async () => {
      await mockServer.forPost('/products').thenJson(400, { errorCode: 'err' }, JSON_HEADERS)

      await expect(
        sendPostBinary(client, '/products', Buffer.from(JSON.stringify(mockProduct1)), {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toThrow('Response status code 400')
    })

    it('Throws an error on internal error', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      await mockServer.forPost('/products').withQuery({ limit: '3' }).thenCloseConnection()

      await expect(
        sendPostBinary(client, '/products', Buffer.from(JSON.stringify({})), {
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('other side closed'),
      })
    })
  })

  describe('PUT', () => {
    it('PUT without queryParams', async () => {
      await mockServer.forPut('/products/1').thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPut(client, '/products/1', mockProduct1, {
        reqContext,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('PUT without body', async () => {
      await mockServer.forPut('/products/1').thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPut(client, '/products/1', undefined, {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('PUT with queryParams', async () => {
      const query = {
        limit: 3,
      }

      await mockServer
        .forPut('/products/1')
        .withQuery({ limit: '3' })
        .thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPut(client, '/products/1', mockProduct1, {
        query,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('PUT that returns 400 throws an error', async () => {
      await mockServer.forPut('/products/1').thenJson(400, { errorCode: 'err' }, JSON_HEADERS)

      await expect(
        sendPut(client, '/products/1', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toThrow('Response status code 400')
    })

    it('Throws an error on internal error', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      await mockServer.forPut('/products').withQuery({ limit: '3' }).thenCloseConnection()

      await expect(
        sendPut(client, '/products', undefined, {
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('other side closed'),
      })
    })

    it('unexpected 204, with validation', async () => {
      await mockServer.forPut('/products/1').thenReply(204)

      await expect(
        sendPut(
          client,
          '/products/1',
          {},
          {
            responseSchema: z.number(),
            requestLabel: 'dummy',
            validateResponse: true,
          },
        ),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('unexpected 204, without validation', async () => {
      await mockServer.forPut('/products/1').thenReply(204)

      const result = await sendPut(
        client,
        '/products/1',
        {},
        {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: false,
        },
      )

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBe('')
    })

    it('expected 204', async () => {
      await mockServer.forPut('/products/1').thenReply(204)

      const result = await sendPut(
        client,
        '/products/1',
        {},
        {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: true,
          isEmptyResponseExpected: true,
        },
      )

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })
  })

  describe('PUT binary', () => {
    it('PUT without queryParams', async () => {
      await mockServer.forPut('/products/1').thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPutBinary(client, '/products/1', Buffer.from('text'), {
        reqContext,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('PUT with queryParams', async () => {
      const query = {
        limit: 3,
      }

      await mockServer
        .forPut('/products/1')
        .withQuery({ limit: '3' })
        .thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPutBinary(client, '/products/1', Buffer.from('text'), {
        query,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('PUT that returns 400 throws an error', async () => {
      await mockServer.forPut('/products/1').thenJson(400, { errorCode: 'err' }, JSON_HEADERS)

      await expect(
        sendPutBinary(client, '/products/1', Buffer.from('text'), {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toThrow('Response status code 400')
    })

    it('Throws an error on internal error', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      await mockServer.forPut('/products').withQuery({ limit: '3' }).thenCloseConnection()

      await expect(
        sendPutBinary(client, '/products', null, {
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('other side closed'),
      })
    })

    it('unexpected 204, with validation', async () => {
      await mockServer.forPut('/products/1').thenReply(204)

      await expect(
        sendPutBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: true,
        }),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('unexpected 204, without validation', async () => {
      await mockServer.forPut('/products/1').thenReply(204)

      const result = await sendPutBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
        responseSchema: z.number(),
        requestLabel: 'dummy',
        validateResponse: false,
      })

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBe('')
    })

    it('expected 204', async () => {
      await mockServer.forPut('/products/1').thenReply(204)

      const result = await sendPutBinary(client, '/products/1', Buffer.from(JSON.stringify({})), {
        responseSchema: z.number(),
        requestLabel: 'dummy',
        validateResponse: true,
        isEmptyResponseExpected: true,
      })

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })
  })

  describe('PATCH', () => {
    it('PATCH without queryParams', async () => {
      await mockServer.forPatch('/products/1').thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPatch(client, '/products/1', mockProduct1, {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('PATCH without body', async () => {
      await mockServer.forPatch('/products/1').thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPatch(client, '/products/1', undefined, {
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('PATCH with queryParams', async () => {
      const query = {
        limit: 3,
      }

      await mockServer
        .forPatch('/products/1')
        .withQuery({ limit: '3' })
        .thenJson(200, { id: 21 }, JSON_HEADERS)

      const result = await sendPatch(client, '/products/1', mockProduct1, {
        query,
        reqContext,
        responseSchema: UNKNOWN_RESPONSE_SCHEMA,
        requestLabel: 'dummy',
      })

      expect(result.result.body).toEqual({ id: 21 })
    })

    it('PATCH that returns 400 throws an error', async () => {
      await mockServer.forPatch('/products/1').thenJson(400, { errorCode: 'err' }, JSON_HEADERS)

      await expect(
        sendPatch(client, '/products/1', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toThrow('Response status code 400')
    })

    it('Throws an error on internal error', async () => {
      expect.assertions(1)
      const query = {
        limit: 3,
      }

      await mockServer.forPatch('/products').withQuery({ limit: '3' }).thenCloseConnection()

      await expect(
        sendPatch(client, '/products', undefined, {
          query,
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('other side closed'),
      })
    })

    it('unexpected 204, with validation', async () => {
      await mockServer.forPatch('/products/1').thenReply(204)

      await expect(
        sendPatch(
          client,
          '/products/1',
          {},
          {
            responseSchema: z.number(),
            requestLabel: 'dummy',
            validateResponse: true,
          },
        ),
      ).rejects.toMatchInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected number, received string"
          }
        ]]
      `)
    })

    it('unexpected 204, without validation', async () => {
      await mockServer.forPatch('/products/1').thenReply(204)

      const result = await sendPatch(
        client,
        '/products/1',
        {},
        {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: false,
        },
      )

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBe('')
    })

    it('expected 204', async () => {
      await mockServer.forPatch('/products/1').thenReply(204)

      const result = await sendPatch(
        client,
        '/products/1',
        {},
        {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          validateResponse: true,
          isEmptyResponseExpected: true,
        },
      )

      expect(result.result.statusCode).toBe(204)
      expect(result.result.body).toBeNull()
    })
  })

  describe('sendGetWithStreamedResponse', () => {
    it('returns streamed response body', async () => {
      const responseData = JSON.stringify(mockProduct1)

      await mockServer.forGet('/products/1').thenReply(200, responseData, JSON_HEADERS)

      const result = await sendGetWithStreamedResponse(client, '/products/1', {
        requestLabel: 'dummy',
      })

      expect(result.result).toBeDefined()
      expect(result.result.statusCode).toBe(200)
      expect(result.result.body).toBeDefined()

      // Read the stream to verify content
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProduct1)
    })

    it('returns streamed response with query params', async () => {
      const query = {
        limit: 3,
      }
      const responseData = JSON.stringify(mockProductsLimit3)

      await mockServer
        .forGet('/products')
        .withQuery({ limit: '3' })
        .thenReply(200, responseData, JSON_HEADERS)

      const result = await sendGetWithStreamedResponse(client, '/products', {
        query,
        requestLabel: 'dummy',
      })

      expect(result.result).toBeDefined()
      expect(result.result.statusCode).toBe(200)

      // Read the stream to verify content
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProductsLimit3)
    })

    it('throws an error when throwOnError is true and request fails', async () => {
      expect.assertions(1)

      await mockServer
        .forGet('/products/1')
        .thenJson(500, { error: 'Internal Server Error' }, JSON_HEADERS)

      await expect(
        sendGetWithStreamedResponse(client, '/products/1', {
          requestLabel: 'dummy',
          throwOnError: true,
        }),
      ).rejects.toMatchObject({
        message: 'Response status code 500',
        errorCode: 'REQUEST_ERROR',
      })
    })

    it('returns error when throwOnError is false and request fails', async () => {
      await mockServer
        .forGet('/products/1')
        .thenJson(500, { error: 'Internal Server Error' }, JSON_HEADERS)

      const result = await sendGetWithStreamedResponse(client, '/products/1', {
        requestLabel: 'dummy',
        throwOnError: false,
      })

      expect(result.error).toBeDefined()
      expect(result.result).toBeUndefined()
    })

    it('returns internal error when connection fails with throwOnError false', async () => {
      await mockServer.forGet('/products/1').thenCloseConnection()

      const result = await sendGetWithStreamedResponse(client, '/products/1', {
        requestLabel: 'dummy',
        throwOnError: false,
      })

      expect(result.result).toBeUndefined()
      expect(isInternalRequestError(result.error)).toBe(true)
    })

    it('throws on internal error when throwOnError is true', async () => {
      expect.assertions(1)

      await mockServer.forGet('/products/1').thenCloseConnection()

      await expect(
        sendGetWithStreamedResponse(client, '/products/1', {
          requestLabel: 'dummy',
          throwOnError: true,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('other side closed'),
      })
    })
  })

  describe('sendByGetRouteWithStreamedResponse', () => {
    it('returns streamed response body', async () => {
      const apiContract = buildGetRoute({
        successResponseBodySchema: undefined,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })
      const responseData = JSON.stringify(mockProduct1)

      await mockServer.forGet('/products/1').thenReply(200, responseData, JSON_HEADERS)

      const result = await sendByGetRouteWithStreamedResponse(
        client,
        apiContract,
        {},
        {
          requestLabel: 'dummy',
        },
      )

      expect(result.result).toBeDefined()
      expect(result.result.statusCode).toBe(200)
      expect(result.result.body).toBeDefined()

      // Read the stream to verify content
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProduct1)
    })

    it('returns streamed response with path and query params', async () => {
      const pathParamsSchema = z.object({
        productId: z.number(),
      })
      const queryParamsSchema = z.object({
        limit: z.number(),
      })
      const apiContract = buildGetRoute({
        successResponseBodySchema: undefined,
        requestPathParamsSchema: pathParamsSchema,
        requestQuerySchema: queryParamsSchema,
        pathResolver: (params) => `/products/${params.productId}`,
      })
      const responseData = JSON.stringify(mockProduct1)

      await mockServer
        .forGet('/products/1')
        .withQuery({ limit: '3' })
        .thenReply(200, responseData, JSON_HEADERS)

      const result = await sendByGetRouteWithStreamedResponse(
        client,
        apiContract,
        {
          pathParams: { productId: 1 },
          queryParams: { limit: 3 },
        },
        {
          requestLabel: 'dummy',
        },
      )

      expect(result.result).toBeDefined()
      expect(result.result.statusCode).toBe(200)

      // Read the stream to verify content
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProduct1)
    })

    it('throws an error when throwOnError is true and request fails', async () => {
      expect.assertions(1)
      const apiContract = buildGetRoute({
        successResponseBodySchema: undefined,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer
        .forGet('/products/1')
        .thenJson(500, { error: 'Internal Server Error' }, JSON_HEADERS)

      await expect(
        sendByGetRouteWithStreamedResponse(
          client,
          apiContract,
          {},
          {
            requestLabel: 'Test request',
            throwOnError: true,
          },
        ),
      ).rejects.toMatchObject({
        message: 'Response status code 500',
        errorCode: 'REQUEST_ERROR',
      })
    })

    it('returns error when throwOnError is false and request fails', async () => {
      const apiContract = buildGetRoute({
        successResponseBodySchema: undefined,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer
        .forGet('/products/1')
        .thenJson(500, { error: 'Internal Server Error' }, JSON_HEADERS)

      const result = await sendByGetRouteWithStreamedResponse(
        client,
        apiContract,
        {},
        {
          requestLabel: 'dummy',
          throwOnError: false,
        },
      )

      expect(result.error).toBeDefined()
      expect(result.result).toBeUndefined()
    })

    it('returns internal error when connection fails with throwOnError false', async () => {
      const apiContract = buildGetRoute({
        successResponseBodySchema: undefined,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })

      await mockServer.forGet('/products/1').thenCloseConnection()

      const result = await sendByGetRouteWithStreamedResponse(
        client,
        apiContract,
        {},
        {
          requestLabel: 'dummy',
          throwOnError: false,
        },
      )

      expect(result.result).toBeUndefined()
      expect(isInternalRequestError(result.error)).toBe(true)
    })

    it('supports retry configuration', async () => {
      const apiContract = buildGetRoute({
        successResponseBodySchema: undefined,
        requestPathParamsSchema: z.undefined(),
        pathResolver: () => '/products/1',
      })
      const responseData = JSON.stringify(mockProduct1)

      let requestCount = 0
      await mockServer.forGet('/products/1').thenCallback(() => {
        requestCount++
        if (requestCount === 1) {
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
            headers: JSON_HEADERS,
          }
        }
        return { statusCode: 200, body: responseData, headers: JSON_HEADERS }
      })

      const result = await sendByGetRouteWithStreamedResponse(
        client,
        apiContract,
        {},
        {
          requestLabel: 'dummy',
          retryConfig: {
            maxAttempts: 2,
            statusCodesToRetry: [500],
            retryOnTimeout: false,
            delayResolver: createDefaultRetryResolver({
              baseDelay: 0,
              maxDelay: 0,
            }),
          },
        },
      )

      expect(result.result).toBeDefined()
      expect(result.result.statusCode).toBe(200)

      // Read the stream to verify content
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProduct1)
    })

    it('sendGetWithStreamedResponse with timeout', async () => {
      const responseData = JSON.stringify(mockProduct1)

      await mockServer.forGet('/products/1').thenReply(200, responseData, JSON_HEADERS)

      const result = await sendGetWithStreamedResponse(client, '/products/1', {
        requestLabel: 'dummy',
        timeout: 60000,
      })

      expect(result.result.statusCode).toBe(200)
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProduct1)
    })

    it('sendGetWithStreamedResponse with disableKeepAlive', async () => {
      const responseData = JSON.stringify(mockProduct1)

      await mockServer.forGet('/products/1').thenReply(200, responseData, JSON_HEADERS)

      const result = await sendGetWithStreamedResponse(client, '/products/1', {
        requestLabel: 'dummy',
        disableKeepAlive: true,
      })

      expect(result.result.statusCode).toBe(200)
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProduct1)
    })

    it('sendGetWithStreamedResponse without throwOnError uses default', async () => {
      const responseData = JSON.stringify(mockProduct1)

      await mockServer.forGet('/products/1').thenReply(200, responseData, JSON_HEADERS)

      const result = await sendGetWithStreamedResponse(client, '/products/1', {
        requestLabel: 'dummy',
      })

      expect(result.result.statusCode).toBe(200)
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProduct1)
    })

    it('sendGetWithStreamedResponse without reqContext', async () => {
      const responseData = JSON.stringify(mockProduct1)

      await mockServer.forGet('/products/1').thenReply(200, responseData, JSON_HEADERS)

      const result = await sendGetWithStreamedResponse(client, '/products/1', {
        requestLabel: 'dummy',
        throwOnError: true,
      })

      expect(result.result.statusCode).toBe(200)
      const body = await streamToString(result.result.body)
      expect(JSON.parse(body)).toEqual(mockProduct1)
    })
  })

  describe('Coverage for optional parameters', () => {
    describe('timeout options', () => {
      it('GET with explicit timeout', async () => {
        await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendGet(client, '/products/1', {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          timeout: 60000,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('GET with null timeout', async () => {
        await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendGet(client, '/products/1', {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          timeout: null,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('DELETE with explicit timeout', async () => {
        await mockServer.forDelete('/products/1').thenReply(204)

        const result = await sendDelete(client, '/products/1', {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          timeout: 60000,
          isEmptyResponseExpected: true,
        })

        expect(result.result.statusCode).toBe(204)
      })

      it('POST with explicit timeout', async () => {
        await mockServer.forPost('/products').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPost(client, '/products', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          timeout: 60000,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('PUT with explicit timeout', async () => {
        await mockServer.forPut('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPut(client, '/products/1', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          timeout: 60000,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('PATCH with explicit timeout', async () => {
        await mockServer.forPatch('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPatch(client, '/products/1', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          timeout: 60000,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('POST binary with explicit timeout', async () => {
        await mockServer.forPost('/products').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPostBinary(client, '/products', Buffer.from('test'), {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          timeout: 60000,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('PUT binary with explicit timeout', async () => {
        await mockServer.forPut('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPutBinary(client, '/products/1', Buffer.from('test'), {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          timeout: 60000,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })
    })

    describe('disableKeepAlive option', () => {
      it('GET with disableKeepAlive true', async () => {
        await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendGet(client, '/products/1', {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          disableKeepAlive: true,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('DELETE with disableKeepAlive true', async () => {
        await mockServer.forDelete('/products/1').thenReply(204)

        const result = await sendDelete(client, '/products/1', {
          responseSchema: z.number(),
          requestLabel: 'dummy',
          disableKeepAlive: true,
          isEmptyResponseExpected: true,
        })

        expect(result.result.statusCode).toBe(204)
      })

      it('POST with disableKeepAlive true', async () => {
        await mockServer.forPost('/products').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPost(client, '/products', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          disableKeepAlive: true,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('PUT with disableKeepAlive true', async () => {
        await mockServer.forPut('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPut(client, '/products/1', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          disableKeepAlive: true,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('PATCH with disableKeepAlive true', async () => {
        await mockServer.forPatch('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPatch(client, '/products/1', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          disableKeepAlive: true,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })
    })

    describe('validateResponse default behavior', () => {
      it('POST without validateResponse set uses default', async () => {
        await mockServer.forPost('/products').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendPost(client, '/products', mockProduct1, {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
        })

        expect(result.result.body).toEqual(mockProduct1)
      })
    })

    describe('route definition isEmptyResponseExpected', () => {
      it('sendByGetRoute with explicit isEmptyResponseExpected true', async () => {
        const apiContract = buildGetRoute({
          successResponseBodySchema: z.number(),
          requestPathParamsSchema: z.undefined(),
          pathResolver: () => '/products/1',
          isEmptyResponseExpected: true,
        })

        await mockServer.forGet('/products/1').thenReply(204)

        const result = await sendByGetRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: false,
          },
        )

        expect(result.result.statusCode).toBe(204)
      })

      it('sendByGetRoute without isEmptyResponseExpected defaults to false', async () => {
        const apiContract = buildGetRoute({
          successResponseBodySchema: UNKNOWN_RESPONSE_SCHEMA,
          requestPathParamsSchema: z.undefined(),
          pathResolver: () => '/products/1',
        })

        await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendByGetRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: false,
          },
        )

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('sendByDeleteRoute with explicit isEmptyResponseExpected false', async () => {
        const apiContract = buildDeleteRoute({
          successResponseBodySchema: UNKNOWN_RESPONSE_SCHEMA,
          requestPathParamsSchema: z.undefined(),
          pathResolver: () => '/products/1',
          isEmptyResponseExpected: false,
        })

        await mockServer.forDelete('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendByDeleteRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: false,
          },
        )

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('sendByDeleteRoute without isEmptyResponseExpected defaults to true', async () => {
        const apiContract = buildDeleteRoute({
          successResponseBodySchema: z.number(),
          requestPathParamsSchema: z.undefined(),
          pathResolver: () => '/products/1',
        })

        await mockServer.forDelete('/products/1').thenReply(204)

        const result = await sendByDeleteRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: false,
          },
        )

        expect(result.result.statusCode).toBe(204)
      })

      it('sendByGetRoute with timeout', async () => {
        const apiContract = buildGetRoute({
          successResponseBodySchema: UNKNOWN_RESPONSE_SCHEMA,
          requestPathParamsSchema: z.undefined(),
          pathResolver: () => '/products/1',
        })

        await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendByGetRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: false,
            timeout: 60000,
          },
        )

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('sendByDeleteRoute with timeout', async () => {
        const apiContract = buildDeleteRoute({
          successResponseBodySchema: z.number(),
          requestPathParamsSchema: z.undefined(),
          pathResolver: () => '/products/1',
        })

        await mockServer.forDelete('/products/1').thenReply(204)

        const result = await sendByDeleteRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
            validateResponse: false,
            timeout: 60000,
          },
        )

        expect(result.result.statusCode).toBe(204)
      })

      it('sendByGetRoute without validateResponse uses default', async () => {
        const apiContract = buildGetRoute({
          successResponseBodySchema: UNKNOWN_RESPONSE_SCHEMA,
          requestPathParamsSchema: z.undefined(),
          pathResolver: () => '/products/1',
        })

        await mockServer.forGet('/products/1').thenJson(200, mockProduct1, JSON_HEADERS)

        const result = await sendByGetRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
          },
        )

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('sendByDeleteRoute without validateResponse uses default', async () => {
        const apiContract = buildDeleteRoute({
          successResponseBodySchema: z.number(),
          requestPathParamsSchema: z.undefined(),
          pathResolver: () => '/products/1',
        })

        await mockServer.forDelete('/products/1').thenReply(204)

        const result = await sendByDeleteRoute(
          client,
          apiContract,
          {},
          {
            requestLabel: 'dummy',
          },
        )

        expect(result.result.statusCode).toBe(204)
      })
    })

    describe('Client-level and request-level timeout configuration', () => {
      it('buildClient accepts custom bodyTimeout and headersTimeout', () => {
        const clientWithCustomTimeout = buildClient(mockServer.url, {
          bodyTimeout: 100,
          headersTimeout: 100,
        })

        expect(clientWithCustomTimeout).toBeInstanceOf(Client)
      })

      it('Default client-level timeout (30s) is used when no request-level timeout provided', async () => {
        const clientWithDefaultTimeout = buildClient(mockServer.url)

        await mockServer.forGet('/timeout-client-level-default').thenCallback(async () => {
          // Simulate a delay less than the default timeout (30s)
          await setTimeout(1000)

          return {
            statusCode: 200,
            headers: JSON_HEADERS,
            body: JSON.stringify(mockProduct1),
          }
        })

        const result = await sendGet(clientWithDefaultTimeout, '/timeout-client-level-default', {
          responseSchema: UNKNOWN_RESPONSE_SCHEMA,
          requestLabel: 'dummy',
          throwOnError: true,
        })

        expect(result.result.body).toEqual(mockProduct1)
      })

      it('Custom client-level timeout is honored when no request-level timeout provided', async () => {
        const clientWithCustomTimeout = buildClient(mockServer.url, {
          bodyTimeout: 100,
          headersTimeout: 100,
        })

        await mockServer.forGet('/timeout-client-level-custom').thenTimeout()

        await expect(
          sendGet(clientWithCustomTimeout, '/timeout-client-level-custom', {
            responseSchema: UNKNOWN_RESPONSE_SCHEMA,
            requestLabel: 'dummy',
            throwOnError: true,
          }),
        ).rejects.toThrow(/Timeout Error/)
      })

      describe('Request-level timeout', () => {
        let clientWithCustomTimeout: Client

        beforeEach(() => {
          clientWithCustomTimeout = buildClient(mockServer.url, {
            bodyTimeout: 5000,
            headersTimeout: 5000,
          })
        })

        it('Request-level timeout works with GET requests', async () => {
          await mockServer.forGet('/timeout-request-level-get').thenTimeout()

          await expect(
            sendGet(clientWithCustomTimeout, '/timeout-request-level-get', {
              responseSchema: UNKNOWN_RESPONSE_SCHEMA,
              requestLabel: 'dummy',
              throwOnError: true,
              timeout: 100,
            }),
          ).rejects.toThrow(/Timeout Error/)
        })

        it('Request-level timeout works with POST requests', async () => {
          await mockServer.forPost('/timeout-request-level-post').thenTimeout()

          await expect(
            sendPost(clientWithCustomTimeout, '/timeout-request-level-post', mockProduct1, {
              responseSchema: UNKNOWN_RESPONSE_SCHEMA,
              requestLabel: 'dummy',
              throwOnError: true,
              timeout: 100,
            }),
          ).rejects.toThrow(/Timeout Error/)
        })

        it('Request-level timeout works with DELETE requests', async () => {
          await mockServer.forDelete('/timeout-request-level-delete').thenTimeout()

          await expect(
            sendDelete(clientWithCustomTimeout, '/timeout-request-level-delete', {
              responseSchema: UNKNOWN_RESPONSE_SCHEMA,
              requestLabel: 'dummy',
              throwOnError: true,
              timeout: 100,
            }),
          ).rejects.toThrow(/Timeout Error/)
        })

        it('Request-level timeout works with PUT requests', async () => {
          await mockServer.forPut('/timeout-request-level-put').thenTimeout()

          await expect(
            sendPut(clientWithCustomTimeout, '/timeout-request-level-put', mockProduct1, {
              responseSchema: UNKNOWN_RESPONSE_SCHEMA,
              requestLabel: 'dummy',
              throwOnError: true,
              timeout: 100,
            }),
          ).rejects.toThrow(/Timeout Error/)
        })

        it('Request-level timeout works with PATCH requests', async () => {
          await mockServer.forPatch('/timeout-request-level-patch').thenTimeout()

          await expect(
            sendPatch(clientWithCustomTimeout, '/timeout-request-level-patch', mockProduct1, {
              responseSchema: UNKNOWN_RESPONSE_SCHEMA,
              requestLabel: 'dummy',
              throwOnError: true,
              timeout: 100,
            }),
          ).rejects.toThrow(/Timeout Error/)
        })

        it('Request-level timeout works with binary POST requests', async () => {
          await mockServer.forPost('/timeout-request-level-binary-post').thenTimeout()

          await expect(
            sendPostBinary(
              clientWithCustomTimeout,
              '/timeout-request-level-binary-post',
              Buffer.from('test'),
              {
                responseSchema: UNKNOWN_RESPONSE_SCHEMA,
                requestLabel: 'dummy',
                throwOnError: true,
                timeout: 100,
              },
            ),
          ).rejects.toThrow(/Timeout Error/)
        })

        it('Request-level timeout works with binary PUT requests', async () => {
          await mockServer.forPut('/timeout-request-level-binary-put').thenTimeout()

          await expect(
            sendPutBinary(
              clientWithCustomTimeout,
              '/timeout-request-level-binary-put',
              Buffer.from('test'),
              {
                responseSchema: UNKNOWN_RESPONSE_SCHEMA,
                requestLabel: 'dummy',
                throwOnError: true,
                timeout: 100,
              },
            ),
          ).rejects.toThrow(/Timeout Error/)
        })

        it('Request-level timeout works with streamed GET requests', async () => {
          await mockServer.forGet('/timeout-request-level-streamed-get').thenTimeout()

          await expect(
            sendGetWithStreamedResponse(
              clientWithCustomTimeout,
              '/timeout-request-level-streamed-get',
              {
                requestLabel: 'dummy',
                throwOnError: true,
                timeout: 100,
              },
            ),
          ).rejects.toThrow(/Timeout Error/)
        })
      })
    })
  })
})
