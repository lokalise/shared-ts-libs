import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import {
  ContractNoBody,
  defineNonJsonResponse,
  defineRouteContract,
  describeRouteContract,
  getIsEmptyResponseExpected,
  getIsNonJsonResponseExpected,
  getSuccessResponseSchema,
  mapRouteContractToPath,
} from './defineRouteContract.ts'
import type { InferSuccessSchema } from './inferTypes.ts'

describe('defineRouteContract', () => {
  describe('type inference', () => {
    it('preserves responseSchemasByStatusCode for success schema inference', () => {
      const schema200 = z.object({ name: z.string() })
      const route = defineRouteContract({
        method: 'get',
        pathResolver: () => '/users',
        responseSchemasByStatusCode: { 200: schema200 },
      })

      type SuccessSchema = InferSuccessSchema<typeof route.responseSchemasByStatusCode>
      expectTypeOf<SuccessSchema>().toEqualTypeOf<typeof schema200>()
    })

    it('infers pathResolver param type from requestPathParamsSchema', () => {
      defineRouteContract({
        method: 'get',
        requestPathParamsSchema: z.object({ userId: z.string(), orgId: z.string() }),
        pathResolver: ({ userId, orgId }) => {
          expectTypeOf(userId).toEqualTypeOf<string>()
          expectTypeOf(orgId).toEqualTypeOf<string>()
          return `/orgs/${orgId}/users/${userId}`
        },
      })
    })

    it('accepts pathResolver without params when no requestPathParamsSchema', () => {
      const route = defineRouteContract({
        method: 'get',
        pathResolver: () => '/users',
      })

      expect(mapRouteContractToPath(route)).toBe('/users')
    })

    it('preserves method literal type', () => {
      const route = defineRouteContract({
        method: 'post',
        pathResolver: () => '/users',
        requestBodySchema: z.object({ name: z.string() }),
      })

      expectTypeOf(route.method).toEqualTypeOf<'post'>()
    })

    it('preserves ContractNoBody sentinel in responseSchemasByStatusCode', () => {
      const route = defineRouteContract({
        method: 'delete',
        requestPathParamsSchema: z.object({ userId: z.string() }),
        pathResolver: ({ userId }) => `/users/${userId}`,
        responseSchemasByStatusCode: { 204: ContractNoBody },
      })

      expectTypeOf(route.responseSchemasByStatusCode['204']).toEqualTypeOf<typeof ContractNoBody>()
    })

    it('preserves TypedNonJsonResponse in responseSchemasByStatusCode', () => {
      const schema = z.string()
      const route = defineRouteContract({
        method: 'get',
        pathResolver: () => '/export.csv',
        responseSchemasByStatusCode: {
          200: defineNonJsonResponse({ contentType: 'text/csv', schema }),
        },
      })

      expectTypeOf(route.responseSchemasByStatusCode['200']).toEqualTypeOf<
        ReturnType<typeof defineNonJsonResponse<typeof schema>>
      >()
    })

    it('preserves serverSentEventSchemas', () => {
      const chunkSchema = z.object({ delta: z.string() })
      const route = defineRouteContract({
        method: 'get',
        pathResolver: () => '/stream',
        serverSentEventSchemas: { chunk: chunkSchema },
      })

      expectTypeOf(route.serverSentEventSchemas.chunk).toEqualTypeOf<typeof chunkSchema>()
    })
  })
})

describe('mapRouteContractToPath', () => {
  it('returns static path when no requestPathParamsSchema', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
    })

    expect(mapRouteContractToPath(route)).toBe('/users')
  })

  it('replaces path params with :param placeholders', () => {
    const route = defineRouteContract({
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
    })

    expect(mapRouteContractToPath(route)).toBe('/users/:userId')
  })

  it('replaces multiple path params', () => {
    const route = defineRouteContract({
      method: 'get',
      requestPathParamsSchema: z.object({ orgId: z.string(), userId: z.string() }),
      pathResolver: ({ orgId, userId }) => `/orgs/${orgId}/users/${userId}`,
    })

    expect(mapRouteContractToPath(route)).toBe('/orgs/:orgId/users/:userId')
  })
})

describe('describeRouteContract', () => {
  it('returns uppercased method and path', () => {
    const route = defineRouteContract({
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
    })

    expect(describeRouteContract(route)).toBe('GET /users/:userId')
  })

  it('works for POST routes', () => {
    const route = defineRouteContract({
      method: 'post',
      pathResolver: () => '/users',
      requestBodySchema: z.object({ name: z.string() }),
    })

    expect(describeRouteContract(route)).toBe('POST /users')
  })
})

describe('getSuccessResponseSchema', () => {
  it('returns null when responseSchemasByStatusCode is not defined', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
    })

    expect(getSuccessResponseSchema(route)).toBeNull()
  })

  it('returns z.never() when all success entries are sentinels', () => {
    const route = defineRouteContract({
      method: 'delete',
      pathResolver: () => '/users/1',
      responseSchemasByStatusCode: { 204: ContractNoBody },
    })

    const result = getSuccessResponseSchema(route)
    expect(result).not.toBeNull()
    expect(result!.safeParse('anything').success).toBe(false)
  })

  it('returns null when only error status codes are defined', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: { 404: z.object({ message: z.string() }) },
    })

    expect(getSuccessResponseSchema(route)).toBeNull()
  })

  it('returns the schema for a single success entry', () => {
    const schema = z.object({ id: z.string() })
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: { 200: schema },
    })

    expect(getSuccessResponseSchema(route)).toBe(schema)
  })

  it('returns a union schema for multiple success entries', () => {
    const schema200 = z.object({ id: z.string() })
    const schema201 = z.object({ name: z.string() })
    const route = defineRouteContract({
      method: 'post',
      pathResolver: () => '/users',
      requestBodySchema: z.object({ name: z.string() }),
      responseSchemasByStatusCode: { 200: schema200, 201: schema201 },
    })

    const result = getSuccessResponseSchema(route)
    expect(result).not.toBeNull()
    expect(result!.parse({ id: 'x' })).toEqual({ id: 'x' })
    expect(result!.parse({ name: 'x' })).toEqual({ name: 'x' })
  })

  it('returns z.never() for TypedNonJsonResponse entries', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/export.csv',
      responseSchemasByStatusCode: {
        200: defineNonJsonResponse({ contentType: 'text/csv', schema: z.string() }),
      },
    })

    const result = getSuccessResponseSchema(route)
    expect(result).not.toBeNull()
    expect(result!.safeParse('anything').success).toBe(false)
  })

  it('contributes z.never() for sentinel entries in a mixed map', () => {
    const schema200 = z.object({ id: z.string() })
    const route = defineRouteContract({
      method: 'post',
      pathResolver: () => '/users',
      requestBodySchema: z.object({ name: z.string() }),
      responseSchemasByStatusCode: { 200: schema200, 204: ContractNoBody },
    })

    const result = getSuccessResponseSchema(route)
    expect(result).not.toBeNull()
    expect(result!.parse({ id: 'x' })).toEqual({ id: 'x' })
  })
})

describe('getIsEmptyResponseExpected', () => {
  it('returns true when responseSchemasByStatusCode is not defined', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
    })

    expect(getIsEmptyResponseExpected(route)).toBe(true)
  })

  it('returns true when all success entries are sentinels', () => {
    const route = defineRouteContract({
      method: 'delete',
      pathResolver: () => '/users/1',
      responseSchemasByStatusCode: { 204: ContractNoBody },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(true)
  })

  it('returns true when only error status codes are defined', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: { 404: z.object({ message: z.string() }) },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(true)
  })

  it('returns false when any success entry has a Zod schema', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(false)
  })

  it('returns false when a mix of schema and sentinel exists', () => {
    const route = defineRouteContract({
      method: 'post',
      pathResolver: () => '/users',
      requestBodySchema: z.object({ name: z.string() }),
      responseSchemasByStatusCode: {
        200: z.object({ id: z.string() }),
        204: ContractNoBody,
      },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(false)
  })

  it('returns false when a TypedNonJsonResponse is present', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/export.csv',
      responseSchemasByStatusCode: {
        200: defineNonJsonResponse({ contentType: 'text/csv', schema: z.string() }),
      },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(false)
  })
})

describe('getIsNonJsonResponseExpected', () => {
  it('returns false when responseSchemasByStatusCode is not defined', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
    })

    expect(getIsNonJsonResponseExpected(route)).toBe(false)
  })

  it('returns false for JSON schema responses', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
    })

    expect(getIsNonJsonResponseExpected(route)).toBe(false)
  })

  it('returns false for ContractNoBody', () => {
    const route = defineRouteContract({
      method: 'delete',
      pathResolver: () => '/users/1',
      responseSchemasByStatusCode: { 204: ContractNoBody },
    })

    expect(getIsNonJsonResponseExpected(route)).toBe(false)
  })

  it('returns true for TypedNonJsonResponse', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/export.csv',
      responseSchemasByStatusCode: {
        200: defineNonJsonResponse({ contentType: 'text/csv', schema: z.string() }),
      },
    })

    expect(getIsNonJsonResponseExpected(route)).toBe(true)
  })

  it('returns false when TypedNonJsonResponse is on an error status code', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: {
        400: defineNonJsonResponse({ contentType: 'text/plain', schema: z.string() }),
      },
    })

    expect(getIsNonJsonResponseExpected(route)).toBe(false)
  })
})
