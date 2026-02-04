import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type { GetRouteDefinition } from '../apiContracts.ts'
import { buildRestContract } from './restContractBuilder.ts'

describe('buildRestContract type inference', () => {
  describe('GET route types', () => {
    it('returns GetRouteDefinition for GET routes', () => {
      const contract = buildRestContract({
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      expectTypeOf(contract).toMatchTypeOf<GetRouteDefinition<z.ZodObject<{ id: z.ZodString }>>>()
      expectTypeOf(contract.method).toEqualTypeOf<'get'>()
    })

    it('infers path params type from schema', () => {
      const pathParamsSchema = z.object({
        userId: z.string(),
        orgId: z.number(),
      })

      const contract = buildRestContract({
        successResponseBodySchema: z.object({ id: z.string() }),
        requestPathParamsSchema: pathParamsSchema,
        pathResolver: (params) => `/orgs/${params.orgId}/users/${params.userId}`,
      })

      // Verify schema is properly typed (optional property, so includes undefined)
      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof pathParamsSchema | undefined
      >()
    })

    it('infers query params type from schema', () => {
      const querySchema = z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
      })

      const contract = buildRestContract({
        successResponseBodySchema: z.object({ items: z.array(z.string()) }),
        requestQuerySchema: querySchema,
        pathResolver: () => '/api/items',
      })

      // Verify schema is properly typed (optional property, so includes undefined)
      expectTypeOf(contract.requestQuerySchema).toEqualTypeOf<typeof querySchema | undefined>()
    })

    it('infers response body type from schema', () => {
      const responseSchema = z.object({
        users: z.array(z.object({ id: z.string(), name: z.string() })),
        total: z.number(),
      })

      const contract = buildRestContract({
        successResponseBodySchema: responseSchema,
        pathResolver: () => '/api/users',
      })

      // Verify schema is properly typed
      expectTypeOf(contract.successResponseBodySchema).toEqualTypeOf(responseSchema)
    })

    it('infers request header type from schema', () => {
      const headerSchema = z.object({
        authorization: z.string(),
        'x-api-key': z.string(),
      })

      const contract = buildRestContract({
        successResponseBodySchema: z.object({}),
        requestHeaderSchema: headerSchema,
        pathResolver: () => '/api/protected',
      })

      // Verify schema is properly typed (optional property, so includes undefined)
      expectTypeOf(contract.requestHeaderSchema).toEqualTypeOf<typeof headerSchema | undefined>()
    })

    it('infers response header type from schema', () => {
      const responseHeaderSchema = z.object({
        'x-ratelimit-limit': z.string(),
        'x-ratelimit-remaining': z.string(),
      })

      const contract = buildRestContract({
        successResponseBodySchema: z.object({}),
        responseHeaderSchema: responseHeaderSchema,
        pathResolver: () => '/api/data',
      })

      // Verify schema is properly typed (optional property, so includes undefined)
      expectTypeOf(contract.responseHeaderSchema).toEqualTypeOf<
        typeof responseHeaderSchema | undefined
      >()
    })
  })

  describe('DELETE route types', () => {
    it('returns DeleteRouteDefinition for DELETE routes', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/users/123',
      })

      // Method should be 'delete'
      expectTypeOf(contract.method).toEqualTypeOf<'delete'>()
      // Should have the structure of a DeleteRouteDefinition
      expectTypeOf(contract).toHaveProperty('method')
      expectTypeOf(contract).toHaveProperty('pathResolver')
      expectTypeOf(contract).toHaveProperty('successResponseBodySchema')
    })

    it('infers path params for DELETE routes', () => {
      const pathParamsSchema = z.object({ userId: z.string() })

      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        requestPathParamsSchema: pathParamsSchema,
        pathResolver: (params) => `/api/users/${params.userId}`,
      })

      // Verify schema is properly typed (optional property, so includes undefined)
      expectTypeOf(contract.requestPathParamsSchema).toEqualTypeOf<
        typeof pathParamsSchema | undefined
      >()
    })

    it('defaults isEmptyResponseExpected to true type', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/resource',
      })

      // DELETE routes should have isEmptyResponseExpected default to true
      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true | undefined>()
    })
  })

  describe('Payload route types (POST/PUT/PATCH)', () => {
    it('returns PayloadRouteDefinition for POST routes', () => {
      const bodySchema = z.object({ name: z.string() })
      const responseSchema = z.object({ id: z.string() })

      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: bodySchema,
        successResponseBodySchema: responseSchema,
        pathResolver: () => '/api/users',
      })

      // Method should be 'post' | 'put' | 'patch' (union due to overload)
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      // Should have requestBodySchema
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('returns PayloadRouteDefinition for PUT routes', () => {
      const bodySchema = z.object({ name: z.string() })

      const contract = buildRestContract({
        method: 'put',
        requestBodySchema: bodySchema,
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users/123',
      })

      // Method should be from payload overload
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('returns PayloadRouteDefinition for PATCH routes', () => {
      const bodySchema = z.object({ name: z.string().optional() })

      const contract = buildRestContract({
        method: 'patch',
        requestBodySchema: bodySchema,
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users/123',
      })

      // Method should be from payload overload
      expectTypeOf(contract.method).toEqualTypeOf<'post' | 'put' | 'patch'>()
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })

    it('infers request body type from schema', () => {
      const requestBodySchema = z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number().optional(),
      })

      const contract = buildRestContract({
        method: 'post',
        requestBodySchema,
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/users',
      })

      // Verify schema is properly typed
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(requestBodySchema)
    })

    it('infers response body type from schema', () => {
      const responseSchema = z.object({
        id: z.string(),
        createdAt: z.string(),
      })

      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: z.object({ data: z.string() }),
        successResponseBodySchema: responseSchema,
        pathResolver: () => '/api/items',
      })

      // Verify schema is properly typed
      expectTypeOf(contract.successResponseBodySchema).toEqualTypeOf(responseSchema)
    })

    it('has requestBodySchema defined for payload routes', () => {
      const bodySchema = z.object({ data: z.string() })

      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: bodySchema,
        successResponseBodySchema: z.object({ id: z.string() }),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.requestBodySchema).not.toBeUndefined()
      expectTypeOf(contract.requestBodySchema).toEqualTypeOf(bodySchema)
    })
  })

  describe('responseSchemasByStatusCode types', () => {
    it('infers status code response types', () => {
      const contract = buildRestContract({
        successResponseBodySchema: z.object({ data: z.string() }),
        pathResolver: () => '/api/data',
        responseSchemasByStatusCode: {
          400: z.object({ error: z.string(), details: z.array(z.string()) }),
          404: z.object({ error: z.literal('Not found') }),
          500: z.object({ error: z.string(), stack: z.string().optional() }),
        },
      })

      expectTypeOf(contract.responseSchemasByStatusCode).not.toBeUndefined()
    })
  })

  describe('pathResolver type safety', () => {
    it('enforces correct path params in pathResolver', () => {
      const pathParamsSchema = z.object({
        userId: z.string(),
        projectId: z.number(),
      })

      // This should compile without errors
      buildRestContract({
        successResponseBodySchema: z.object({}),
        requestPathParamsSchema: pathParamsSchema,
        pathResolver: (params) => {
          // TypeScript should know params has userId and projectId
          const path = `/users/${params.userId}/projects/${params.projectId}`
          return path
        },
      })
    })

    it('allows empty params when no path params schema', () => {
      // This should compile without errors
      buildRestContract({
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/users',
      })
    })
  })

  describe('metadata type augmentation', () => {
    it('preserves metadata type', () => {
      const contract = buildRestContract({
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
        metadata: { customField: 'value', anotherField: 123 },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Record<string, unknown> | undefined>()
    })
  })

  describe('boolean flag types', () => {
    describe('isEmptyResponseExpected', () => {
      it('defaults to false type for GET routes', () => {
        const contract = buildRestContract({
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('defaults to false type for POST routes', () => {
        const contract = buildRestContract({
          method: 'post',
          requestBodySchema: z.object({}),
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('defaults to true type for DELETE routes', () => {
        const contract = buildRestContract({
          method: 'delete',
          successResponseBodySchema: z.undefined(),
          pathResolver: () => '/api/resource',
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true | undefined>()
      })

      it('reflects explicit true value in type for GET', () => {
        const contract = buildRestContract({
          successResponseBodySchema: z.undefined(),
          pathResolver: () => '/api/void',
          isEmptyResponseExpected: true,
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true | undefined>()
      })

      it('reflects explicit false value in type for DELETE', () => {
        const contract = buildRestContract({
          method: 'delete',
          successResponseBodySchema: z.object({ deleted: z.boolean() }),
          pathResolver: () => '/api/resource',
          isEmptyResponseExpected: false,
        })

        expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
      })
    })

    describe('isNonJSONResponseExpected', () => {
      it('defaults to false type for GET routes', () => {
        const contract = buildRestContract({
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('defaults to false type for POST routes', () => {
        const contract = buildRestContract({
          method: 'post',
          requestBodySchema: z.object({}),
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('defaults to false type for DELETE routes', () => {
        const contract = buildRestContract({
          method: 'delete',
          successResponseBodySchema: z.undefined(),
          pathResolver: () => '/api/resource',
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
      })

      it('reflects explicit true value in type', () => {
        const contract = buildRestContract({
          successResponseBodySchema: z.string(),
          pathResolver: () => '/api/file',
          isNonJSONResponseExpected: true,
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<true | undefined>()
      })

      it('reflects explicit false value in type', () => {
        const contract = buildRestContract({
          successResponseBodySchema: z.object({}),
          pathResolver: () => '/api/data',
          isNonJSONResponseExpected: false,
        })

        expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
      })
    })
  })
})
