import failOnConsole from 'jest-fail-on-console'
import { getLocal } from 'mockttp'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import wretch from 'wretch'
import { z } from 'zod'

import {
  buildDeleteRoute,
  buildGetRoute,
  buildPayloadRoute,
} from '@lokalise/universal-ts-utils/api-contracts/apiContracts'
import {
  sendByDeleteRoute,
  sendByGetRoute,
  sendByPayloadRoute,
  sendDelete,
  sendGet,
  sendPatch,
  sendPost,
  sendPut,
} from './client.js'

describe('frontend-http-client', () => {
  const mockServer = getLocal()

  beforeAll(() => {
    failOnConsole({
      silenceMessage: (message: string) => message.includes('ZodError'),
    })
  })
  beforeEach(() => mockServer.start())
  afterEach(() => mockServer.stop())

  describe('sendByRoute', () => {
    it('returns deserialized response for POST', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/users/1').thenJson(200, { data: { code: 99 } })

      const requestBodySchema = z.object({
        isActive: z.boolean(),
      })

      const responseBodySchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildPayloadRoute({
        method: 'post',
        responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestBodySchema: requestBodySchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByPayloadRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        body: {
          isActive: true,
        },
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns deserialized response for POST without a body', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/users/1').thenJson(200, { data: { code: 99 } })

      const responseBodySchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildPayloadRoute({
        method: 'post',
        responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestBodySchema: undefined,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByPayloadRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns deserialized response for GET with query params', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/users/1').thenJson(200, { data: { code: 99 } })

      const responseBodySchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const pathSchema = z.object({
        userId: z.number(),
      })

      const querySchema = z.object({
        id: z.string(),
      })

      const routeDefinition = buildGetRoute({
        responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestQuerySchema: querySchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByGetRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        queryParams: {
          id: 'frfr',
        },
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns deserialized response for GET without query params', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/users/1').thenJson(200, { data: { code: 99 } })

      const responseBodySchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildGetRoute({
        responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestQuerySchema: undefined,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByGetRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns response for DELETE', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/users/1').thenReply(204)

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildDeleteRoute({
        isEmptyResponseExpected: true,
        responseBodySchema: undefined,
        requestPathParamsSchema: pathSchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByDeleteRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
      })

      expect(responseBody).toBeNull()
    })

    it('returns deserialized response without body or path params', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/users').thenJson(200, { data: { code: 99 } })

      const responseBodySchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const routeDefinition = buildPayloadRoute({
        method: 'post',
        isEmptyResponseExpected: false,
        isNonJSONResponseExpected: false,
        responseBodySchema,
        requestBodySchema: undefined,
        pathResolver: () => '/users',
      })

      const responseBody = await sendByPayloadRoute(client, routeDefinition, {})

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })
  })

  describe('sendPost', () => {
    it('returns deserialized response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const responseBody = await sendPost(client, {
        path: '/',
        responseBodySchema: responseSchema,
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenReply(204)

      const responseBody = await sendPost(client, {
        path: '/',
        responseBodySchema: z.any(),
      })
      expect(responseBody).toBe(null)
    })

    it('returns unexpected no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenReply(204)

      await expect(
        sendPost(client, {
          path: '/',
          isEmptyResponseExpected: false,
          responseBodySchema: z.any(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected empty response.]`,
      )
    })

    it('returns not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenReply(200)

      const responseBody = await sendPost(client, {
        path: '/',
        responseBodySchema: z.any(),
      })
      expect(responseBody).containSubset({
        status: 200,
        statusText: 'OK',
      })
    })

    it('returns unexpected not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenReply(200)

      await expect(
        sendPost(client, {
          path: '/',
          isNonJSONResponseExpected: false,
          responseBodySchema: z.any(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected non-JSON response.]`,
      )
    })

    it('throws an error if response does not pass validation', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPost(client, {
          path: '/',
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "undefined",
				    "path": [
				      "code"
				    ],
				    "message": "Required"
				  }
				]]
			`)
    })

    it('throws an error if request does not pass validation', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenJson(200, { data: { code: 99 } })

      const requestSchema = z.object({
        requestCode: z.number(),
      })
      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPost(client, {
          path: '/',
          body: {} as any, // otherwise it breaks at compilation already
          requestBodySchema: requestSchema,
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "undefined",
				    "path": [
				      "requestCode"
				    ],
				    "message": "Required"
				  }
				]]
			`)
    })

    it('throws an error if query params does not pass validation', async () => {
      const client = wretch(mockServer.url)

      const testQueryParams = { param1: 'test', param2: 'test' }

      await mockServer.forPost('/').withQuery(testQueryParams).thenJson(200, { success: true })

      const queryParamsSchema = z.object({
        param1: z.string(),
        param2: z.number(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      await expect(
        sendPost(client, {
          path: '/',
          queryParams: testQueryParams,
          queryParamsSchema: queryParamsSchema as any,
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "string",
				    "path": [
				      "param2"
				    ],
				    "message": "Expected number, received string"
				  }
				]]
			`)
    })

    it('allows posting request with correct params even if schemas are not provided', async () => {
      const client = wretch(mockServer.url)

      const testQueryParams = { param1: 'test', param2: 'test' }

      await mockServer.forPost('/').withQuery(testQueryParams).thenJson(200, { success: true })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      const response = await sendPost(client, {
        path: '/',
        queryParams: testQueryParams,
        queryParamsSchema: undefined,
        responseBodySchema: responseSchema,
        body: { id: 1 },
        requestBodySchema: undefined,
      })

      expect(response).toEqual({ success: true })
    })

    it('correctly serializes and sends query parameters', async () => {
      const client = wretch(mockServer.url)

      const testQueryParams = { param1: 'test', param2: 123 }

      await mockServer.forPost('/').withQuery(testQueryParams).thenJson(200, { success: true })

      const requestSchema = z.object({
        param1: z.string(),
        param2: z.number(),
        param3: z.string().optional(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      const response = await sendPost(client, {
        path: '/',
        queryParams: testQueryParams,
        queryParamsSchema: requestSchema,
        responseBodySchema: responseSchema,
      })

      expect(response).toEqual({ success: true })
    })

    it('correctly serializes and sends request body', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenJson(200, { success: true })

      const requestSchema = z.object({
        param1: z.string(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      const response = await sendPost(client, {
        path: '/',
        body: { param1: 'test' },
        requestBodySchema: requestSchema,
        responseBodySchema: responseSchema,
      })

      expect(response).toEqual({ success: true })
    })

    it('should check types against schema input type', async () => {
      const client = wretch(mockServer.url)
      await mockServer.forPost('/').thenJson(200, { success: true })

      const schema = z.object({
        numberAsText: z
          .number()
          .transform((val) => val.toString())
          .pipe(z.string()),
      })
      const responseSchema = z.object({
        success: z.boolean(),
      })

      const response = await sendPost(client, {
        path: '/',
        queryParams: { numberAsText: 1 },
        queryParamsSchema: schema,
        responseBodySchema: responseSchema,
        body: { numberAsText: 1 },
        requestBodySchema: schema,
      })

      expect(response).toEqual({ success: true })
    })
  })

  describe('sendPut', () => {
    it('returns deserialized response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const responseBody = await sendPut(client, {
        path: '/',
        responseBodySchema: responseSchema,
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenReply(204)

      const responseBody = await sendPut(client, {
        path: '/',
        responseBodySchema: z.any(),
      })
      expect(responseBody).toBe(null)
    })

    it('returns unexpected no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenReply(204)

      await expect(
        sendPut(client, {
          path: '/',
          responseBodySchema: z.any(),
          isEmptyResponseExpected: false,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected empty response.]`,
      )
    })

    it('returns not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenReply(200)

      const responseBody = await sendPut(client, {
        path: '/',
        responseBodySchema: z.any(),
      })
      expect(responseBody).containSubset({
        status: 200,
        statusText: 'OK',
      })
    })

    it('returns unexpected not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenReply(200)

      await expect(
        sendPut(client, {
          path: '/',
          responseBodySchema: z.any(),
          isNonJSONResponseExpected: false,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected non-JSON response.]`,
      )
    })

    it('throws an error if response does not pass validation', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPut(client, {
          path: '/',
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "undefined",
				    "path": [
				      "code"
				    ],
				    "message": "Required"
				  }
				]]
			`)
    })

    it('throws an error if request does not pass validation', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenJson(200, { data: { code: 99 } })

      const requestSchema = z.object({
        requestCode: z.number(),
      })
      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPut(client, {
          path: '/',
          body: {} as any, // otherwise it breaks at compilation already
          requestBodySchema: requestSchema,
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "undefined",
				    "path": [
				      "requestCode"
				    ],
				    "message": "Required"
				  }
				]]
			`)
    })

    it('throws an error if query params does not pass validation', async () => {
      const client = wretch(mockServer.url)

      const testQueryParams = { param1: 'test', param2: 'test' }

      await mockServer.forPut('/').withQuery(testQueryParams).thenJson(200, { success: true })

      const queryParamsSchema = z.object({
        param1: z.string(),
        param2: z.number(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      await expect(
        sendPut(client, {
          path: '/',
          queryParams: testQueryParams,
          queryParamsSchema: queryParamsSchema as any,
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "string",
				    "path": [
				      "param2"
				    ],
				    "message": "Expected number, received string"
				  }
				]]
			`)
    })

    it('correctly serializes and sends query parameters', async () => {
      const client = wretch(mockServer.url)

      const testQueryParams = { param1: 'test', param2: 123 }

      await mockServer.forPut('/').withQuery(testQueryParams).thenJson(200, { success: true })

      const requestSchema = z.object({
        param1: z.string(),
        param2: z.number(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      const response = await sendPut(client, {
        path: '/',
        queryParams: testQueryParams,
        queryParamsSchema: requestSchema,
        responseBodySchema: responseSchema,
      })

      expect(response).toEqual({ success: true })
    })

    it('correctly serializes and sends request body', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenJson(200, { success: true })

      const requestSchema = z.object({
        param1: z.string(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      const response = await sendPut(client, {
        path: '/',
        body: { param1: 'test' },
        requestBodySchema: requestSchema,
        responseBodySchema: responseSchema,
      })

      expect(response).toEqual({ success: true })
    })
  })

  describe('sendPatch', () => {
    it('returns deserialized response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const responseBody = await sendPatch(client, {
        path: '/',
        responseBodySchema: responseSchema,
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenReply(204)

      const responseBody = await sendPatch(client, {
        path: '/',
        responseBodySchema: z.any(),
      })
      expect(responseBody).toBe(null)
    })

    it('returns unexpected no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenReply(204)

      await expect(
        sendPatch(client, {
          path: '/',
          responseBodySchema: z.any(),
          isEmptyResponseExpected: false,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected empty response.]`,
      )
    })

    it('returns not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenReply(200)

      const responseBody = await sendPatch(client, {
        path: '/',
        responseBodySchema: z.any(),
      })
      expect(responseBody).containSubset({
        status: 200,
        statusText: 'OK',
      })
    })

    it('returns unexpected not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenReply(200)

      await expect(
        sendPatch(client, {
          path: '/',
          responseBodySchema: z.any(),
          isNonJSONResponseExpected: false,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected non-JSON response.]`,
      )
    })

    it('throws an error if response does not pass validation', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPatch(client, {
          path: '/',
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "undefined",
				    "path": [
				      "code"
				    ],
				    "message": "Required"
				  }
				]]
			`)
    })

    it('throws an error if request does not pass validation', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenJson(200, { data: { code: 99 } })

      const requestSchema = z.object({
        requestCode: z.number(),
      })
      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPatch(client, {
          path: '/',
          body: {} as any, // otherwise it breaks at compilation already
          requestBodySchema: requestSchema,
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "undefined",
				    "path": [
				      "requestCode"
				    ],
				    "message": "Required"
				  }
				]]
			`)
    })

    it('throws an error if query params does not pass validation', async () => {
      const client = wretch(mockServer.url)

      const testQueryParams = { param1: 'test', param2: 'test' }

      await mockServer.forPatch('/').withQuery(testQueryParams).thenJson(200, { success: true })

      const queryParamsSchema = z.object({
        param1: z.string(),
        param2: z.number(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      await expect(
        sendPatch(client, {
          path: '/',
          queryParams: testQueryParams,
          queryParamsSchema: queryParamsSchema as any,
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "string",
				    "path": [
				      "param2"
				    ],
				    "message": "Expected number, received string"
				  }
				]]
			`)
    })

    it('correctly serializes and sends query parameters', async () => {
      const client = wretch(mockServer.url)

      const testQueryParams = { param1: 'test', param2: 123 }

      await mockServer.forPatch('/').withQuery(testQueryParams).thenJson(200, { success: true })

      const requestSchema = z.object({
        param1: z.string(),
        param2: z.number(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      const response = await sendPatch(client, {
        path: '/',
        queryParams: testQueryParams,
        queryParamsSchema: requestSchema,
        responseBodySchema: responseSchema,
      })

      expect(response).toEqual({ success: true })
    })

    it('correctly serializes and sends request body', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenJson(200, { success: true })

      const requestSchema = z.object({
        param1: z.string(),
      })

      const responseSchema = z.object({
        success: z.boolean(),
      })

      const response = await sendPatch(client, {
        path: '/',
        body: { param1: 'test' },
        requestBodySchema: requestSchema,
        responseBodySchema: responseSchema,
      })

      expect(response).toEqual({ success: true })
    })
  })

  describe('sendGet', () => {
    it('returns deserialized response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const responseBody = await sendGet(client, {
        path: '/',
        responseBodySchema: responseSchema,
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenReply(204)

      await expect(
        sendGet(client, {
          path: '/',
          responseBodySchema: z.any(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected empty response.]`,
      )
    })

    it('returns expected no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenReply(204)

      const response = await sendGet(client, {
        path: '/',
        responseBodySchema: z.object({
          id: z.string(),
        }),
        isEmptyResponseExpected: true,
      })

      if (response) {
        // @ts-expect-error WretchResponse has this field, null does not
        expect(response.ok).toBe(true)
      }

      // This is to test TS types: it should correctly infer that value is null or defined schema
      if (response) {
        expect(response.id).toBeDefined()
      }

      expect(response).toBe(null)
    })

    it('returns non-JSON response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenReply(200)

      await expect(
        sendGet(client, {
          path: '/',
          responseBodySchema: z.any(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected non-JSON response.]`,
      )
    })

    it('returns expected non-JSON response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenReply(200)

      const responseBody = await sendGet(client, {
        path: '/',
        responseBodySchema: z.any(),
        isNonJSONResponseExpected: true,
      })

      // This is for checking TS types, we are checking if it infers the responseBody type as null | WretchResponse correctly
      expect(responseBody.ok).toBe(true)

      expect(responseBody).containSubset({
        status: 200,
        statusText: 'OK',
      })
    })

    it('throws an error if response does not pass validation', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendGet(client, {
          path: '/',
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "undefined",
				    "path": [
				      "code"
				    ],
				    "message": "Required"
				  }
				]]
			`)
    })

    it('throws an error if request does not pass validation', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenJson(200, { data: { code: 99 } })

      const requestSchema = z.object({
        requestCode: z.number(),
      })
      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendGet(client, {
          path: '/',
          queryParams: {} as any, // otherwise it breaks at compilation already
          queryParamsSchema: requestSchema,
          responseBodySchema: responseSchema,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "number",
				    "received": "undefined",
				    "path": [
				      "requestCode"
				    ],
				    "message": "Required"
				  }
				]]
			`)
    })

    it('returns correct data if everything is ok', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenJson(200, { data: { code: 99 } })

      const requestSchema = z.object({
        requestCode: z.coerce.number(),
      })
      const responseSchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const response = await sendGet(client, {
        path: '/',
        queryParams: {
          requestCode: 99,
        },
        queryParamsSchema: requestSchema,
        responseBodySchema: responseSchema,
      })

      expect(response?.data.code).toBe(99)
    })

    it('should work without specifying an schema', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenJson(200, { data: { code: 99 } })

      const responseSchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const response = await sendGet(client, {
        path: '/',
        queryParams: {
          requestCode: 99,
        },
        queryParamsSchema: undefined,
        responseBodySchema: responseSchema,
      })

      expect(response?.data.code).toBe(99)
    })

    it('should check types against schema input type', async () => {
      const client = wretch(mockServer.url)
      await mockServer.forGet('/').thenJson(200, { data: { code: 99 } })

      const querySchema = z.object({
        numberAsText: z
          .number()
          .transform((val) => val.toString())
          .pipe(z.string()),
      })
      const responseSchema = z.object({
        data: z.object({
          code: z.number(),
        }),
      })

      const responseBody = await sendGet(client, {
        path: '/',
        queryParams: { numberAsText: 1 },
        queryParamsSchema: querySchema,
        responseBodySchema: responseSchema,
      })

      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })
  })

  describe('sendDelete', () => {
    it('returns no content response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/').thenReply(204)

      const response = await sendDelete(client, {
        path: '/',
      })

      expect(response).toBeNull()
    })

    it('validates response if schema is provided', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/').thenJson(200, { string: 1 })

      await expect(
        sendDelete(client, {
          path: '/',
          responseBodySchema: z.object({
            string: z.string(),
          }),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "string",
				    "received": "number",
				    "path": [
				      "string"
				    ],
				    "message": "Expected string, received number"
				  }
				]]
			`)
    })

    it('returns validated response if schema is provided and response is correct', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/').thenJson(200, { string: '1' })

      const response = await sendDelete(client, {
        path: '/',
        responseBodySchema: z.object({
          string: z.string(),
        }),
      })

      expect(response).toMatchInlineSnapshot(`
				{
				  "string": "1",
				}
			`)
    })

    it('supports query params', async () => {
      const client = wretch(mockServer.url)
      const testQueryParams = { param1: 'test', param2: 'test' }

      await mockServer.forDelete().withQuery(testQueryParams).thenReply(204)

      const response = await sendDelete(client, {
        path: '/',
        queryParams: testQueryParams,
      })

      expect(response).toBeNull()
    })

    it('validates query params', async () => {
      const client = wretch(mockServer.url)
      const testQueryParams = { param1: 'test', param2: 'test' }

      await expect(
        sendDelete(client, {
          path: '/',
          // @ts-expect-error Schema does not match the object
          queryParams: testQueryParams,
          queryParamsSchema: z.string(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
				[ZodError: [
				  {
				    "code": "invalid_type",
				    "expected": "string",
				    "received": "object",
				    "path": [],
				    "message": "Expected string, received object"
				  }
				]]
			`)
    })

    it('throws if content is expected, but response is empty', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/').thenReply(204)

      await expect(
        sendDelete(client, {
          path: '/',
          isEmptyResponseExpected: false,
          responseBodySchema: z.any(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected empty response.]`,
      )
    })

    it('returns non-JSON response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/').thenReply(200)

      const responseBody = await sendDelete(client, {
        path: '/',
      })
      expect(responseBody).containSubset({
        status: 200,
        statusText: 'OK',
      })
    })

    it('returns unexpected non-JSON response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/').thenReply(200)

      await expect(
        sendDelete(client, {
          path: '/',
          isNonJSONResponseExpected: false,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Request to / has returned an unexpected non-JSON response.]`,
      )
    })
  })
})
