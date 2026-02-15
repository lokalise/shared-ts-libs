import { buildDeleteRoute, buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import { newServer } from 'mock-xmlhttprequest'
import { getLocal, type Mockttp } from 'mockttp'
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest'
import wretch from 'wretch'
import { z } from 'zod/v4'
import {
  sendByContract,
  sendByDeleteRoute,
  sendByGetRoute,
  sendByPayloadRoute,
  sendDelete,
  sendGet,
  sendPatch,
  sendPost,
  sendPostWithProgress,
  sendPut,
} from './client.ts'

const JSON_HEADERS = {
  'Content-Type': 'application/json',
}

const HEADERS_SCHEMA = z
  .object({
    authorization: z.string(),
  })
  .strip()

describe('frontend-http-client', () => {
  let mockServer: Mockttp

  beforeAll(async () => {
    mockServer = getLocal()
    await mockServer.start()
  })

  afterAll(async () => {
    await mockServer.stop()
  })

  afterEach(() => {
    mockServer.reset()
  })

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
        successResponseBodySchema: responseBodySchema,
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

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
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
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestBodySchema: undefined,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByPayloadRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns deserialized response for GET with query params', async () => {
      const client = wretch(mockServer.url)

      await mockServer
        .forGet('/users/1')
        .thenJson(200, { data: { code: 99, values: ['test1', 'test2'] } })

      const arrayPreprocessor = (value: unknown) => (Array.isArray(value) ? value : [value])

      const responseBodySchema = z.object({
        data: z.object({
          code: z.number(),
          values: z.preprocess(arrayPreprocessor, z.array(z.string())),
        }),
      })

      const pathSchema = z.object({
        userId: z.number(),
        test: z.number().default(10),
      })

      const querySchema = z.object({
        id: z.string(),
      })

      const routeDefinition = buildGetRoute({
        successResponseBodySchema: responseBodySchema,
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

      // satisfies verifies that responseBody type is inferred properly
      expectTypeOf(responseBody).toEqualTypeOf<z.output<typeof responseBodySchema>>()
      expect(responseBody satisfies z.infer<typeof responseBodySchema>).toEqual({
        data: {
          code: 99,
          values: ['test1', 'test2'],
        },
      })
    })

    it('handles separation between input and output values for query params correctly', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/users/1').thenCallback((req) => {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ data: { code: 99, url: req.url } }),
        }
      })

      const responseBodySchema = z.object({
        data: z.object({
          code: z.number(),
          url: z.string(),
        }),
      })

      const pathSchema = z.object({
        userId: z.number(),
        test: z.number().default(10),
      })

      const querySchema = z.object({
        sort: z
          .string()
          .transform((value) => {
            return value.split(',')
          })
          .pipe(
            z.array(
              z.enum(['startDate', '-startDate', 'endDate', '-endDate', 'status', '-status']),
            ),
          )
          .optional(),
      })

      const routeDefinition = buildGetRoute({
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestQuerySchema: querySchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByGetRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        queryParams: {
          sort: '-startDate,endDate',
        },
      })

      // satisfies verifies that responseBody type is inferred properly
      expectTypeOf(responseBody).toEqualTypeOf<z.output<typeof responseBodySchema>>()
      expect(responseBody satisfies z.infer<typeof responseBodySchema>).toEqual({
        data: {
          code: 99,
          url: `${mockServer.url}/users/1?sort=-startDate%2CendDate`,
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
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestQuerySchema: undefined,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByGetRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('supports passing headers for a GET request', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/users/1').thenCallback((req) => {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            headers: req.headers.authorization,
          }),
        }
      })

      const responseBodySchema = z.any()

      const pathSchema = z.object({
        userId: z.number(),
        test: z.number().default(10),
      })

      const routeDefinition = buildGetRoute({
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByGetRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        headers: { authorization: 'dummy' },
      })

      // satisfies verifies that responseBody type is inferred properly
      expect(responseBody satisfies z.infer<typeof responseBodySchema>).toMatchInlineSnapshot(`
        {
          "headers": "dummy",
        }
      `)
    })

    it('supports passing headers factory for a GET request', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/users/1').thenCallback((req) => {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            headers: req.headers.authorization,
          }),
        }
      })

      const responseBodySchema = z.any()

      const pathSchema = z.object({
        userId: z.number(),
        test: z.number().default(10),
      })

      const routeDefinition = buildGetRoute({
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByGetRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        headers: () => Promise.resolve({ authorization: 'dummy' }),
      })

      // satisfies verifies that responseBody type is inferred properly
      expect(responseBody satisfies z.infer<typeof responseBodySchema>).toMatchInlineSnapshot(`
        {
          "headers": "dummy",
        }
      `)
    })

    it('returns response for DELETE', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/users/1').thenReply(204)

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildDeleteRoute({
        isEmptyResponseExpected: true,
        successResponseBodySchema: undefined,
        requestPathParamsSchema: pathSchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByDeleteRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<null>()
      expect(responseBody).toBeNull()
    })

    it('supports passing header factory for a DELETE request', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/users/1').thenCallback((req) => {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            headers: req.headers.authorization,
          }),
        }
      })

      const responseBodySchema = z.any()

      const pathSchema = z.object({
        userId: z.number(),
        test: z.number().default(10),
      })

      const routeDefinition = buildDeleteRoute({
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByDeleteRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        headers: () => Promise.resolve({ authorization: 'dummy' }),
      })

      // satisfies verifies that responseBody type is inferred properly
      expect(responseBody satisfies z.infer<typeof responseBodySchema>).toMatchInlineSnapshot(`
        {
          "headers": "dummy",
        }
      `)
    })

    it('supports passing header factory for a POST request', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/users/1').thenCallback((req) => {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            headers: req.headers.authorization,
          }),
        }
      })

      const responseBodySchema = z.any()

      const pathSchema = z.object({
        userId: z.number(),
        test: z.number().default(10),
      })

      const requestBodySchema = z.object({
        isActive: z.boolean(),
      })

      const routeDefinition = buildPayloadRoute({
        method: 'post',
        requestBodySchema,
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByPayloadRoute(client, routeDefinition, {
        body: {
          isActive: true,
        },
        pathParams: {
          userId: 1,
        },
        headers: () => Promise.resolve({ authorization: 'dummy' }),
      })

      // satisfies verifies that responseBody type is inferred properly
      expect(responseBody satisfies z.infer<typeof responseBodySchema>).toMatchInlineSnapshot(`
        {
          "headers": "dummy",
        }
      `)
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
        successResponseBodySchema: responseBodySchema,
        requestBodySchema: undefined,
        pathResolver: () => '/users',
      })

      const responseBody = await sendByPayloadRoute(client, routeDefinition, {})

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('works with path prefix for GET routes', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/v1/users/1').thenJson(200, { id: 1 })

      const responseBodySchema = z.object({
        id: z.number(),
      })

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildGetRoute({
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByGetRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        pathPrefix: 'v1',
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ id: number }>()
      expect(responseBody).toEqual({ id: 1 })
    })

    it('works with path prefix for POST routes', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/v1/users/1').thenJson(200, { id: 1 })

      const responseBodySchema = z.object({
        id: z.number(),
      })

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildPayloadRoute({
        method: 'post',
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestBodySchema: undefined,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByPayloadRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        pathPrefix: 'v1',
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ id: number }>()
      expect(responseBody).toEqual({ id: 1 })
    })

    it('works with path prefix for DELETE routes', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/v1/users/1').thenReply(204)

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildDeleteRoute({
        successResponseBodySchema: undefined,
        requestPathParamsSchema: pathSchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByDeleteRoute(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        pathPrefix: 'v1',
      })

      expectTypeOf(responseBody).toEqualTypeOf<null>()
      expect(responseBody).toBeNull()
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

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns no content response for 204', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenReply(204)

      const responseBody = await sendPost(client, {
        path: '/',
        responseBodySchema: z.any(),
        isEmptyResponseExpected: true,
      })
      expect(responseBody).toBe(null)
    })

    it('returns no content response for 202', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenReply(202)

      const responseBody = await sendPost(client, {
        path: '/',
        responseBodySchema: z.any(),
        isEmptyResponseExpected: true,
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
        '[Error: Request to / has returned an unexpected empty response.]',
      )
    })

    it('returns not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/').thenReply(200)

      const responseBody = await sendPost(client, {
        path: '/',
        responseBodySchema: z.any(),
        isNonJSONResponseExpected: true,
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
        '[Error: Request to / has returned an unexpected non-JSON response.]',
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "code"
            ],
            "message": "Invalid input: expected number, received undefined"
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "requestCode"
            ],
            "message": "Invalid input: expected number, received undefined"
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "param2"
            ],
            "message": "Invalid input: expected number, received string"
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

      expectTypeOf(response).toEqualTypeOf<{ success: boolean }>()
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

      expectTypeOf(response).toEqualTypeOf<{ success: boolean }>()
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

      expectTypeOf(response).toEqualTypeOf<{ success: boolean }>()
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

      expectTypeOf(response).toEqualTypeOf<{ success: boolean }>()
      expect(response).toEqual({ success: true })
    })
  })

  describe('sendPostWithProgress', () => {
    const successResponseSchema = z.object({
      data: z.object({
        code: z.number(),
      }),
    })

    const TEST_CASES: Array<{ type: string; getData: () => XMLHttpRequestBodyInit }> = [
      {
        type: 'FormData',
        getData: () => {
          const data = new FormData()

          data.append('file', 'Some data ...')

          return data
        },
      },
      {
        type: 'stringified JSON',
        getData: () => JSON.stringify({ someKey: 'some value' }),
      },
      {
        type: 'Blob',
        getData: () => new Blob(['test'], { type: 'text/plain' }),
      },
      {
        type: 'ArrayBuffer',
        getData: () => new ArrayBuffer(8),
      },
      {
        type: 'Uint8Array',
        getData: () => new Uint8Array([1, 2, 3, 4]),
      },
      {
        type: 'URLSearchParams',
        getData: () => new URLSearchParams({ someKey: 'some value' }),
      },
      {
        type: 'DataView',
        getData: () => new DataView(new ArrayBuffer(8)),
      },
    ]

    it.each(TEST_CASES)('allows sending $type and returns deserialized response', async ({
      getData,
    }) => {
      const handlePostRequestMock = vi.fn().mockReturnValue({ data: { code: 99 } })

      const mockXhrServer = newServer().post('/', (request) =>
        request.respond(
          201,
          { 'Content-Type': 'application/json' },
          JSON.stringify(handlePostRequestMock(request.body)),
        ),
      )

      mockXhrServer.install()

      const data = getData()

      const response = await sendPostWithProgress({
        path: '/',
        data,
        responseBodySchema: successResponseSchema,
        onProgress: vi.fn(),
      })

      expect(response).toEqual({ data: { code: 99 } })
      expect(handlePostRequestMock).toHaveBeenCalledWith(data)

      mockXhrServer.remove()
    })

    it('sets headers properly', async () => {
      const headersMock = vi.fn()

      const mockXhrServer = newServer().post('/', (request) => {
        headersMock(request.requestHeaders.getAll())

        return request.respond(
          201,
          { 'Content-Type': 'application/json' },
          JSON.stringify({ data: { code: 99 } }),
        )
      })

      mockXhrServer.install()

      await sendPostWithProgress({
        path: '/',
        data: new FormData(),
        headers: {
          Authorization: 'Bearer token',
        },
        responseBodySchema: successResponseSchema,
        onProgress: vi.fn(),
      })

      expect(headersMock).toHaveBeenCalledWith(
        'authorization: Bearer token\r\ncontent-type: multipart/form-data; boundary=-----MochXhr1234\r\n',
      )

      mockXhrServer.remove()
    })

    it('calls `onProgress` while request is being sent', async () => {
      const onProgressMock = vi.fn()
      const mockXhrServer = newServer().post(
        '/',
        (request) =>
          new Promise<void>((resolve) => {
            request.uploadProgress(7)

            setTimeout(() => {
              request.respond(
                201,
                { 'Content-Type': 'application/json' },
                JSON.stringify({ data: { code: 99 } }),
              )
              resolve()
            }, 2_000)
          }),
      )

      mockXhrServer.install()

      const data = new FormData()

      data.append('file', 'Some data ...')

      await sendPostWithProgress({
        path: '/',
        data,
        responseBodySchema: successResponseSchema,
        onProgress: onProgressMock,
      })

      expect(onProgressMock).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 7,
          total: 13,
        }),
      )

      mockXhrServer.remove()
    })

    it('throws an error if response does not pass validation', async () => {
      const mockXhrServer = newServer().post('/', (request) =>
        request.respond(
          201,
          { 'Content-Type': 'application/json' },
          JSON.stringify({ data: { code: 99 } }),
        ),
      )
      mockXhrServer.install()

      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPostWithProgress({
          path: '/',
          responseBodySchema: responseSchema,
          data: new FormData(),
          onProgress: vi.fn(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "code"
            ],
            "message": "Invalid input: expected number, received undefined"
          }
        ]]
      `)

      mockXhrServer.remove()
    })

    it('throws an error when API returns an error', async () => {
      const mockXhrServer = newServer().post('/', (request) => request.respond(500))
      mockXhrServer.install()

      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPostWithProgress({
          path: '/',
          responseBodySchema: responseSchema,
          data: new FormData(),
          onProgress: vi.fn(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot('[Error: File upload failed]')

      mockXhrServer.remove()
    })

    it('throws an error when could not connect', async () => {
      const mockXhrServer = newServer().post('/', (request) => request.setNetworkError())

      mockXhrServer.install()

      const responseSchema = z.object({
        code: z.number(),
      })

      await expect(
        sendPostWithProgress({
          path: '/',
          responseBodySchema: responseSchema,
          data: new FormData(),
          onProgress: vi.fn(),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot('[Error: File upload failed: ]')

      mockXhrServer.remove()
    })

    it('allows to abort an ongoing request', async () => {
      // Given
      const abortController = new AbortController()
      const onProgressMock = vi.fn()
      const responseMock = vi.fn().mockReturnValue({ data: { code: 99 } })

      const mockXhrServer = newServer().post(
        '/',
        (request) =>
          new Promise<void>((resolve) => {
            request.uploadProgress(0)

            setTimeout(() => {
              request.uploadProgress(13)

              request.respond(
                201,
                { 'Content-Type': 'application/json' },
                JSON.stringify(responseMock()),
              )
              resolve()
              // Time doesn't matter, cause the request promise is aborted
            }, 500)
          }),
      )

      mockXhrServer.install()

      const data = new FormData()

      data.append('file', 'Some data ...')

      const requestPromise = sendPostWithProgress({
        path: '/',
        data,
        responseBodySchema: successResponseSchema,
        onProgress: onProgressMock,
        abortController,
      })

      // When
      setTimeout(() => abortController.abort(), 100)

      await expect(requestPromise).rejects.toThrowErrorMatchingInlineSnapshot(
        '[Error: Request aborted]',
      )

      // Then
      expect(onProgressMock).toHaveBeenCalledOnce()
      expect(onProgressMock).toHaveBeenCalledWith(
        expect.objectContaining({
          loaded: 0,
          total: 13,
        }),
      )
      expect(responseMock).not.toHaveBeenCalled()

      mockXhrServer.remove()
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

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns no content response for 204', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenReply(204)

      const responseBody = await sendPut(client, {
        path: '/',
        responseBodySchema: z.any(),
        isEmptyResponseExpected: true,
      })
      expect(responseBody).toBe(null)
    })

    it('returns no content response for 202', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenReply(202)

      const responseBody = await sendPut(client, {
        path: '/',
        responseBodySchema: z.any(),
        isEmptyResponseExpected: true,
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
        '[Error: Request to / has returned an unexpected empty response.]',
      )
    })

    it('returns not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/').thenReply(200)

      const responseBody = await sendPut(client, {
        path: '/',
        responseBodySchema: z.any(),
        isNonJSONResponseExpected: true,
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
        '[Error: Request to / has returned an unexpected non-JSON response.]',
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "code"
            ],
            "message": "Invalid input: expected number, received undefined"
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "requestCode"
            ],
            "message": "Invalid input: expected number, received undefined"
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "param2"
            ],
            "message": "Invalid input: expected number, received string"
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

      expectTypeOf(response).toEqualTypeOf<{ success: boolean }>()
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

      expectTypeOf(response).toEqualTypeOf<{ success: boolean }>()
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

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns no content response for 204', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenReply(204)

      const responseBody = await sendPatch(client, {
        path: '/',
        responseBodySchema: z.any(),
        isEmptyResponseExpected: true,
      })
      expect(responseBody).toBe(null)
    })

    it('returns no content response for 202', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenReply(202)

      const responseBody = await sendPatch(client, {
        path: '/',
        responseBodySchema: z.any(),
        isEmptyResponseExpected: true,
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
        '[Error: Request to / has returned an unexpected empty response.]',
      )
    })

    it('returns not json response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/').thenReply(200)

      const responseBody = await sendPatch(client, {
        path: '/',
        responseBodySchema: z.any(),
        isNonJSONResponseExpected: true,
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
        '[Error: Request to / has returned an unexpected non-JSON response.]',
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "code"
            ],
            "message": "Invalid input: expected number, received undefined"
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "requestCode"
            ],
            "message": "Invalid input: expected number, received undefined"
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "param2"
            ],
            "message": "Invalid input: expected number, received string"
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

      expectTypeOf(response).toEqualTypeOf<{ success: boolean }>()
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

      expectTypeOf(response).toEqualTypeOf<{ success: boolean }>()
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

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('returns no content response for 204', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenReply(204)

      const response = await sendGet(client, {
        path: '/',
        responseBodySchema: z.any(),
        isEmptyResponseExpected: true,
      })

      expect(response).toBeNull()
    })

    it('returns unexpected no content response for 202', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/').thenReply(202)

      await expect(
        sendGet(client, {
          path: '/',
          responseBodySchema: z.any(),
          isEmptyResponseExpected: false,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        '[Error: Request to / has returned an unexpected non-JSON response.]',
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

      expectTypeOf(response).toEqualTypeOf<{ id: string } | null>()
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
        '[Error: Request to / has returned an unexpected non-JSON response.]',
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "code"
            ],
            "message": "Invalid input: expected number, received undefined"
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
            "expected": "number",
            "code": "invalid_type",
            "path": [
              "requestCode"
            ],
            "message": "Invalid input: expected number, received undefined"
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

      expectTypeOf(response).toEqualTypeOf<{ data: { code: number } }>()
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

      expectTypeOf(response).toEqualTypeOf<{ data: { code: number } }>()
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

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
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
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "string"
            ],
            "message": "Invalid input: expected string, received number"
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

      expectTypeOf(response).toEqualTypeOf<{ string: string } | null>()
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
            "expected": "string",
            "code": "invalid_type",
            "path": [],
            "message": "Invalid input: expected string, received object"
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
        '[Error: Request to / has returned an unexpected empty response.]',
      )
    })

    it('returns non-JSON response', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/').thenReply(200)

      const responseBody = await sendDelete(client, {
        path: '/',
        isNonJSONResponseExpected: true,
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
        '[Error: Request to / has returned an unexpected non-JSON response.]',
      )
    })
  })

  describe('sendByContract', () => {
    it('sends GET request via contract', async () => {
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
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('sends GET request with query params via contract', async () => {
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
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestQuerySchema: querySchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        queryParams: {
          id: 'frfr',
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody satisfies z.infer<typeof responseBodySchema>).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('sends POST request via contract', async () => {
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
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestBodySchema: requestBodySchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        body: {
          isActive: true,
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('sends PUT request via contract', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPut('/users/1').thenJson(200, { data: { code: 99 } })

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
        method: 'put',
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestBodySchema: requestBodySchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        body: {
          isActive: true,
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('sends PATCH request via contract', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPatch('/users/1').thenJson(200, { data: { code: 99 } })

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
        method: 'patch',
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestBodySchema: requestBodySchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        body: {
          isActive: true,
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ data: { code: number } }>()
      expect(responseBody).toEqual({
        data: {
          code: 99,
        },
      })
    })

    it('sends DELETE request via contract', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/users/1').thenReply(204)

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildDeleteRoute({
        isEmptyResponseExpected: true,
        successResponseBodySchema: undefined,
        requestPathParamsSchema: pathSchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
      })

      expectTypeOf(responseBody).toEqualTypeOf<null>()
      expect(responseBody).toBeNull()
    })

    it('supports passing headers factory for a POST request', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/users/1').thenCallback((req) => {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({
            headers: req.headers.authorization,
          }),
        }
      })

      const responseBodySchema = z.any()

      const pathSchema = z.object({
        userId: z.number(),
      })

      const requestBodySchema = z.object({
        isActive: z.boolean(),
      })

      const routeDefinition = buildPayloadRoute({
        method: 'post',
        requestBodySchema,
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestHeaderSchema: HEADERS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        body: {
          isActive: true,
        },
        pathParams: {
          userId: 1,
        },
        headers: () => Promise.resolve({ authorization: 'dummy' }),
      })

      expect(responseBody satisfies z.infer<typeof responseBodySchema>).toMatchInlineSnapshot(`
        {
          "headers": "dummy",
        }
      `)
    })

    it('works with path prefix for GET routes', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forGet('/v1/users/1').thenJson(200, { id: 1 })

      const responseBodySchema = z.object({
        id: z.number(),
      })

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildGetRoute({
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        pathPrefix: 'v1',
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ id: number }>()
      expect(responseBody).toEqual({ id: 1 })
    })

    it('works with path prefix for POST routes', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forPost('/v1/users/1').thenJson(200, { id: 1 })

      const responseBodySchema = z.object({
        id: z.number(),
      })

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildPayloadRoute({
        method: 'post',
        successResponseBodySchema: responseBodySchema,
        requestPathParamsSchema: pathSchema,
        requestBodySchema: undefined,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        pathPrefix: 'v1',
      })

      expectTypeOf(responseBody).toEqualTypeOf<{ id: number }>()
      expect(responseBody).toEqual({ id: 1 })
    })

    it('works with path prefix for DELETE routes', async () => {
      const client = wretch(mockServer.url)

      await mockServer.forDelete('/v1/users/1').thenReply(204)

      const pathSchema = z.object({
        userId: z.number(),
      })

      const routeDefinition = buildDeleteRoute({
        successResponseBodySchema: undefined,
        requestPathParamsSchema: pathSchema,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const responseBody = await sendByContract(client, routeDefinition, {
        pathParams: {
          userId: 1,
        },
        pathPrefix: 'v1',
      })

      expectTypeOf(responseBody).toEqualTypeOf<null>()
      expect(responseBody).toBeNull()
    })
  })
})
