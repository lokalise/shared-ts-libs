import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody } from './constants.ts'
import {
  anyOfResponses,
  blobResponse,
  isAnyOfResponses,
  isBlobResponse,
  isSseResponse,
  isTextResponse,
  sseResponse,
  type TypedBlobResponse,
  type TypedTextResponse,
  textResponse,
} from './contractResponse.ts'
import {
  defineRouteContract,
  describeRouteContract,
  getIsEmptyResponseExpected,
  getSseSchemaByEventName,
  getSuccessResponseSchema,
  mapRouteContractToPath,
} from './defineRouteContract.ts'
import type { InferJsonSuccessResponses } from './inferTypes.ts'

describe('defineRouteContract', () => {
  describe('type inference', () => {
    it('preserves responseSchemasByStatusCode for success schema inference', () => {
      const schema = z.object({ name: z.string() })
      const route = defineRouteContract({
        method: 'get',
        pathResolver: () => '/users',
        responseSchemasByStatusCode: { 200: schema },
      })

      type Result = InferJsonSuccessResponses<typeof route.responseSchemasByStatusCode>
      expectTypeOf<Result>().toEqualTypeOf<typeof schema>()
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
        responseSchemasByStatusCode: {},
      })
    })

    it('accepts pathResolver without params when no requestPathParamsSchema', () => {
      const route = defineRouteContract({
        method: 'get',
        pathResolver: () => '/users',
        responseSchemasByStatusCode: {},
      })

      expect(mapRouteContractToPath(route)).toBe('/users')
    })

    it('preserves method literal type', () => {
      const route = defineRouteContract({
        method: 'post',
        pathResolver: () => '/users',
        requestBodySchema: z.object({ name: z.string() }),
        responseSchemasByStatusCode: {},
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

    it('preserves TypedTextResponse in responseSchemasByStatusCode', () => {
      const route = defineRouteContract({
        method: 'get',
        pathResolver: () => '/export.csv',
        responseSchemasByStatusCode: {
          200: textResponse('text/csv'),
        },
      })

      expectTypeOf(route.responseSchemasByStatusCode['200']).toEqualTypeOf<TypedTextResponse>()
    })

    it('preserves TypedBlobResponse in responseSchemasByStatusCode', () => {
      const route = defineRouteContract({
        method: 'get',
        pathResolver: () => '/photo.png',
        responseSchemasByStatusCode: {
          200: blobResponse('image/png'),
        },
      })

      expectTypeOf(route.responseSchemasByStatusCode['200']).toEqualTypeOf<TypedBlobResponse>()
    })
  })
})

describe('mapRouteContractToPath', () => {
  it('returns static path when no requestPathParamsSchema', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: {},
    })

    expect(mapRouteContractToPath(route)).toBe('/users')
  })

  it('replaces path params with :param placeholders', () => {
    const route = defineRouteContract({
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
      responseSchemasByStatusCode: {},
    })

    expect(mapRouteContractToPath(route)).toBe('/users/:userId')
  })

  it('replaces multiple path params', () => {
    const route = defineRouteContract({
      method: 'get',
      requestPathParamsSchema: z.object({ orgId: z.string(), userId: z.string() }),
      pathResolver: ({ orgId, userId }) => `/orgs/${orgId}/users/${userId}`,
      responseSchemasByStatusCode: {},
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
      responseSchemasByStatusCode: {},
    })

    expect(describeRouteContract(route)).toBe('GET /users/:userId')
  })

  it('works for POST routes', () => {
    const route = defineRouteContract({
      method: 'post',
      pathResolver: () => '/users',
      requestBodySchema: z.object({ name: z.string() }),
      responseSchemasByStatusCode: {},
    })

    expect(describeRouteContract(route)).toBe('POST /users')
  })
})

describe('getSuccessResponseSchema', () => {
  it('returns null when responseSchemasByStatusCode is not defined', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: {},
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

  it('returns z.never() for textResponse entries', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/export.csv',
      responseSchemasByStatusCode: { 200: textResponse('text/csv') },
    })

    const result = getSuccessResponseSchema(route)
    expect(result).not.toBeNull()
    expect(result!.safeParse('anything').success).toBe(false)
  })

  it('returns z.never() for blobResponse entries', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/photo.png',
      responseSchemasByStatusCode: { 200: blobResponse('image/png') },
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
      responseSchemasByStatusCode: {},
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

  it('returns false when a textResponse is present', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/export.csv',
      responseSchemasByStatusCode: { 200: textResponse('text/csv') },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(false)
  })

  it('returns false when a blobResponse is present', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/photo.png',
      responseSchemasByStatusCode: { 200: blobResponse('image/png') },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(false)
  })
})

describe('isTextResponse', () => {
  it('returns true for TypedTextResponse', () => {
    expect(isTextResponse(textResponse('text/csv'))).toBe(true)
  })

  it('returns false for z.ZodType', () => {
    expect(isTextResponse(z.string())).toBe(false)
  })

  it('returns false for TypedBlobResponse', () => {
    expect(isTextResponse(blobResponse('image/png'))).toBe(false)
  })

  it('returns false for ContractNoBody', () => {
    expect(isTextResponse(ContractNoBody)).toBe(false)
  })
})

describe('isBlobResponse', () => {
  it('returns true for TypedBlobResponse', () => {
    expect(isBlobResponse(blobResponse('image/png'))).toBe(true)
  })

  it('returns false for z.ZodType', () => {
    expect(isBlobResponse(z.string())).toBe(false)
  })

  it('returns false for TypedTextResponse', () => {
    expect(isBlobResponse(textResponse('text/csv'))).toBe(false)
  })

  it('returns false for ContractNoBody', () => {
    expect(isBlobResponse(ContractNoBody)).toBe(false)
  })
})

describe('isSseResponse', () => {
  it('returns true for TypedSseResponse', () => {
    const value = sseResponse({ chunk: z.object({ delta: z.string() }) })
    expect(isSseResponse(value)).toBe(true)
  })

  it('returns false for z.ZodType', () => {
    expect(isSseResponse(z.string())).toBe(false)
  })

  it('returns false for ContractNoBody', () => {
    expect(isSseResponse(ContractNoBody)).toBe(false)
  })

  it('returns false for TypedTextResponse', () => {
    expect(isSseResponse(textResponse('text/csv'))).toBe(false)
  })
})

describe('isAnyOfResponses', () => {
  it('returns true for AnyOfResponse', () => {
    const value = anyOfResponses([sseResponse({ chunk: z.string() }), z.object({ id: z.string() })])
    expect(isAnyOfResponses(value)).toBe(true)
  })

  it('returns true for AnyOfResponse containing textResponse', () => {
    const value = anyOfResponses([textResponse('text/csv')])
    expect(isAnyOfResponses(value)).toBe(true)
  })

  it('returns true for AnyOfResponse containing blobResponse', () => {
    const value = anyOfResponses([blobResponse('image/png')])
    expect(isAnyOfResponses(value)).toBe(true)
  })

  it('returns false for TypedSseResponse', () => {
    expect(isAnyOfResponses(sseResponse({ chunk: z.string() }))).toBe(false)
  })

  it('returns false for z.ZodType', () => {
    expect(isAnyOfResponses(z.string())).toBe(false)
  })
})

describe('getSuccessResponseSchema with SSE', () => {
  it('returns z.never() for sseResponse', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/stream',
      responseSchemasByStatusCode: {
        200: sseResponse({ chunk: z.object({ delta: z.string() }) }),
      },
    })

    const result = getSuccessResponseSchema(route)
    expect(result).not.toBeNull()
    expect(result!.safeParse('anything').success).toBe(false)
  })

  it('returns the JSON schema from anyOfResponses, excluding sseResponse', () => {
    const jsonSchema = z.object({ id: z.string() })
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/stream',
      responseSchemasByStatusCode: {
        200: anyOfResponses([sseResponse({ chunk: z.object({ delta: z.string() }) }), jsonSchema]),
      },
    })

    const result = getSuccessResponseSchema(route)
    expect(result).toBe(jsonSchema)
  })

  it('returns null for anyOf with only sseResponse', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/stream',
      responseSchemasByStatusCode: {
        200: anyOfResponses([sseResponse({ chunk: z.object({ delta: z.string() }) })]),
      },
    })

    expect(getSuccessResponseSchema(route)).toBeNull()
  })

  it('returns null for anyOf with only textResponse', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/export.csv',
      responseSchemasByStatusCode: {
        200: anyOfResponses([textResponse('text/csv')]),
      },
    })

    expect(getSuccessResponseSchema(route)).toBeNull()
  })

  it('returns the JSON schema from anyOfResponses, excluding textResponse', () => {
    const jsonSchema = z.object({ id: z.string() })
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/export',
      responseSchemasByStatusCode: {
        200: anyOfResponses([textResponse('text/csv'), jsonSchema]),
      },
    })

    expect(getSuccessResponseSchema(route)).toBe(jsonSchema)
  })
})

describe('getIsEmptyResponseExpected with SSE', () => {
  it('returns false for sseResponse', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/stream',
      responseSchemasByStatusCode: {
        200: sseResponse({ chunk: z.object({ delta: z.string() }) }),
      },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(false)
  })

  it('returns false for anyOf', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/stream',
      responseSchemasByStatusCode: {
        200: anyOfResponses([sseResponse({ chunk: z.string() }), z.object({ id: z.string() })]),
      },
    })

    expect(getIsEmptyResponseExpected(route)).toBe(false)
  })
})

describe('getSseSchemaByEventName', () => {
  it('returns null when no SSE schemas are present', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: { 200: z.object({ id: z.string() }) },
    })

    expect(getSseSchemaByEventName(route)).toBeNull()
  })

  it('returns null when responseSchemasByStatusCode is not defined', () => {
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: {},
    })

    expect(getSseSchemaByEventName(route)).toBeNull()
  })

  it('extracts schemas from sseResponse in responseSchemasByStatusCode', () => {
    const chunkSchema = z.object({ delta: z.string() })
    const doneSchema = z.object({ finish_reason: z.string() })
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/stream',
      responseSchemasByStatusCode: {
        200: sseResponse({ chunk: chunkSchema, done: doneSchema }),
      },
    })

    const result = getSseSchemaByEventName(route)
    expect(result).not.toBeNull()
    expect(result!.chunk).toBe(chunkSchema)
    expect(result!.done).toBe(doneSchema)
  })

  it('extracts sseResponse schemas from inside anyOf', () => {
    const chunkSchema = z.object({ delta: z.string() })
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/stream',
      responseSchemasByStatusCode: {
        200: anyOfResponses([sseResponse({ chunk: chunkSchema }), z.object({ id: z.string() })]),
      },
    })

    const result = getSseSchemaByEventName(route)
    expect(result).not.toBeNull()
    expect(result!.chunk).toBe(chunkSchema)
  })
})
