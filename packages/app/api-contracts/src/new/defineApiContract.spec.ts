import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody } from './constants.ts'
import { sseBody } from './contractResponse.ts'
import {
  defineApiContract,
  describeApiContract,
  getSseSchemaByEventName,
  hasAnySuccessSseResponse,
  mapApiContractToPath,
} from './defineApiContract.ts'
import type { InferJsonSuccessResponses } from './inferTypes.ts'

describe('defineApiContract', () => {
  describe('type inference', () => {
    it('preserves responsesByStatusCode for success schema inference', () => {
      const schema = z.object({ name: z.string() })
      const route = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/users',
        responsesByStatusCode: { 200: schema },
      })

      type Result = InferJsonSuccessResponses<typeof route.responsesByStatusCode>
      expectTypeOf<Result>().toEqualTypeOf<typeof schema>()
    })

    it('infers pathResolver param type from requestPathParamsSchema', () => {
      defineApiContract({
        summary: 'Test contract',
        method: 'get',
        requestPathParamsSchema: z.object({ userId: z.string(), orgId: z.string() }),
        pathResolver: ({ userId, orgId }) => {
          expectTypeOf(userId).toEqualTypeOf<string>()
          expectTypeOf(orgId).toEqualTypeOf<string>()
          return `/orgs/${orgId}/users/${userId}`
        },
        responsesByStatusCode: {},
      })
    })

    it('accepts pathResolver without params when no requestPathParamsSchema', () => {
      const route = defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/users',
        responsesByStatusCode: {},
      })

      expect(mapApiContractToPath(route)).toBe('/users')
    })

    it('types pathResolver param as undefined when no requestPathParamsSchema', () => {
      defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: (params) => {
          expectTypeOf(params).toEqualTypeOf<undefined>()
          return '/users'
        },
        responsesByStatusCode: {},
      })
    })

    it('rejects pathResolver that declares params when no requestPathParamsSchema', () => {
      defineApiContract({
        summary: 'Test contract',
        method: 'get',
        // @ts-expect-error pathResolver cannot take params without requestPathParamsSchema
        pathResolver: (params: { id: string }) => `/users/${params.id}`,
        responsesByStatusCode: {},
      })
    })

    it('preserves method literal type', () => {
      const route = defineApiContract({
        summary: 'Test contract',
        method: 'post',
        pathResolver: () => '/users',
        requestBodySchema: z.object({ name: z.string() }),
        responsesByStatusCode: {},
      })

      expectTypeOf(route.method).toEqualTypeOf<'post'>()
    })

    it('rejects requestBodySchema on GET contracts', () => {
      // @ts-expect-error GET must not accept a request body
      defineApiContract({
        summary: 'Test contract',
        method: 'get',
        pathResolver: () => '/users',
        requestBodySchema: z.object({ name: z.string() }),
        responsesByStatusCode: {},
      })
    })

    it('rejects requestBodySchema on DELETE contracts', () => {
      // @ts-expect-error DELETE must not accept a request body
      defineApiContract({
        summary: 'Test contract',
        method: 'delete',
        pathResolver: () => '/users/1',
        requestBodySchema: z.object({ name: z.string() }),
        responsesByStatusCode: {},
      })
    })

    it('requires requestBodySchema on POST contracts', () => {
      // @ts-expect-error POST requires requestBodySchema
      defineApiContract({
        summary: 'Test contract',
        method: 'post',
        pathResolver: () => '/users',
        responsesByStatusCode: {},
      })
    })

    it('accepts ContractNoBody as requestBodySchema on POST contracts', () => {
      const route = defineApiContract({
        summary: 'Test contract',
        method: 'post',
        pathResolver: () => '/users',
        requestBodySchema: ContractNoBody,
        responsesByStatusCode: {},
      })

      expectTypeOf(route.requestBodySchema).toEqualTypeOf<typeof ContractNoBody>()
    })
  })
})

describe('mapApiContractToPath', () => {
  it('returns static path when no requestPathParamsSchema', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: {},
    })

    expect(mapApiContractToPath(route)).toBe('/users')
  })

  it('replaces path params with :param placeholders', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
      responsesByStatusCode: {},
    })

    expect(mapApiContractToPath(route)).toBe('/users/:userId')
  })

  it('replaces multiple path params', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      requestPathParamsSchema: z.object({ orgId: z.string(), userId: z.string() }),
      pathResolver: ({ orgId, userId }) => `/orgs/${orgId}/users/${userId}`,
      responsesByStatusCode: {},
    })

    expect(mapApiContractToPath(route)).toBe('/orgs/:orgId/users/:userId')
  })
})

describe('describeApiContract', () => {
  it('returns uppercased method and path', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      requestPathParamsSchema: z.object({ userId: z.string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
      responsesByStatusCode: {},
    })

    expect(describeApiContract(route)).toBe('GET /users/:userId')
  })

  it('works for POST routes', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'post',
      pathResolver: () => '/users',
      requestBodySchema: z.object({ name: z.string() }),
      responsesByStatusCode: {},
    })

    expect(describeApiContract(route)).toBe('POST /users')
  })
})

describe('getSseSchemaByEventName with content-map entries', () => {
  it('extracts the SSE schema from a content-map sseBody descriptor', () => {
    const schemaByEventName = { tick: z.object({ n: z.number() }) }
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: {
          content: {
            'application/json': z.object({ id: z.string() }),
            'text/event-stream': sseBody(schemaByEventName),
          },
        },
      },
    })

    expect(getSseSchemaByEventName(route)).toEqual(schemaByEventName)
  })

  it('hasAnySuccessSseResponse is true for a content-map sseBody descriptor', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: { content: { 'text/event-stream': sseBody({ tick: z.object({ n: z.number() }) }) } },
      },
    })

    expect(hasAnySuccessSseResponse(route)).toBe(true)
  })
})

describe('hasAnySuccessSseResponse', () => {
  it('returns true for an sseBody at a success code', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: {
          content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
        },
      },
    })

    expect(hasAnySuccessSseResponse(route)).toBe(true)
  })

  it('returns false when sseBody is only at an error status code', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: z.object({ id: z.string() }),
        404: { content: { 'text/event-stream': sseBody({ error: z.string() }) } },
      },
    })

    expect(hasAnySuccessSseResponse(route)).toBe(false)
  })

  it('returns false when no SSE response is present', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: z.object({ id: z.string() }) },
    })

    expect(hasAnySuccessSseResponse(route)).toBe(false)
  })

  it('returns true for sseBody under the default key', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        default: {
          content: { 'text/event-stream': sseBody({ chunk: z.object({ delta: z.string() }) }) },
        },
      },
    })

    expect(hasAnySuccessSseResponse(route)).toBe(true)
  })

  it('returns false for non-SSE response under the default key', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: { default: z.object({ message: z.string() }) },
    })

    expect(hasAnySuccessSseResponse(route)).toBe(false)
  })
})

describe('getSseSchemaByEventName', () => {
  it('returns null when no SSE schemas are present', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: { 200: z.object({ id: z.string() }) },
    })

    expect(getSseSchemaByEventName(route)).toBeNull()
  })

  it('returns null when responsesByStatusCode is not defined', () => {
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/users',
      responsesByStatusCode: {},
    })

    expect(getSseSchemaByEventName(route)).toBeNull()
  })

  it('extracts schemas from sseBody in responsesByStatusCode', () => {
    const chunkSchema = z.object({ delta: z.string() })
    const doneSchema = z.object({ finish_reason: z.string() })
    const route = defineApiContract({
      summary: 'Test contract',
      method: 'get',
      pathResolver: () => '/stream',
      responsesByStatusCode: {
        200: {
          content: { 'text/event-stream': sseBody({ chunk: chunkSchema, done: doneSchema }) },
        },
      },
    })

    const result = getSseSchemaByEventName(route)
    expect(result).not.toBeNull()
    expect(result!.chunk).toBe(chunkSchema)
    expect(result!.done).toBe(doneSchema)
  })
})
