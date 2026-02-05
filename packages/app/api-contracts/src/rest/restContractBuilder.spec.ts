import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { describeContract, mapRouteToPath } from '../apiContracts.ts'
import { buildRestContract } from './restContractBuilder.ts'

const BODY_SCHEMA = z.object({})
const PATH_PARAMS_SCHEMA = z.object({
  userId: z.string(),
})
const PATH_PARAMS_MULTI_SCHEMA = z.object({
  userId: z.string(),
  orgId: z.string(),
})
const REQUEST_HEADER_SCHEMA = z.object({
  authorization: z.string(),
  'x-api-key': z.string(),
})
const RESPONSE_HEADER_SCHEMA = z.object({
  'x-ratelimit-limit': z.string(),
  'x-ratelimit-remaining': z.string(),
  'x-ratelimit-reset': z.string(),
})

describe('buildRestContract', () => {
  describe('POST route (payload)', () => {
    it('sets default payload route values', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestBodySchema: BODY_SCHEMA,
        method: 'post',
        description: 'some description',
        responseSchemasByStatusCode: {
          200: BODY_SCHEMA,
          400: z.object({ message: z.string() }),
        },
        pathResolver: () => '/',
      })

      expect(contract).toMatchSnapshot()
    })

    it('supports PUT method', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestBodySchema: BODY_SCHEMA,
        method: 'put',
        pathResolver: () => '/api/users',
      })

      expect(contract.method).toBe('put')
    })

    it('supports PATCH method', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestBodySchema: BODY_SCHEMA,
        method: 'patch',
        pathResolver: () => '/api/users',
      })

      expect(contract.method).toBe('patch')
    })

    it('defaults isEmptyResponseExpected to false for POST', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestBodySchema: BODY_SCHEMA,
        method: 'post',
        pathResolver: () => '/api/users',
      })

      expect(contract.isEmptyResponseExpected).toBe(false)
    })

    it('defaults isNonJSONResponseExpected to false for POST', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestBodySchema: BODY_SCHEMA,
        method: 'post',
        pathResolver: () => '/api/users',
      })

      expect(contract.isNonJSONResponseExpected).toBe(false)
    })
  })

  describe('GET route', () => {
    it('sets default get route values', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
        responseSchemasByStatusCode: {
          '200': BODY_SCHEMA,
          '400': z.object({ message: z.string() }),
        },
        description: 'some description',
        metadata: { hello: 'world' },
      })

      expect(contract).toMatchSnapshot()
    })

    it('resolves path params', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      expect(contract).toMatchSnapshot()
    })

    it('infers method as get when no method specified', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/api/users',
      })

      expect(contract.method).toBe('get')
    })

    it('defaults isEmptyResponseExpected to false for GET', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/api/users',
      })

      expect(contract.isEmptyResponseExpected).toBe(false)
    })

    it('defaults isNonJSONResponseExpected to false for GET', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/api/users',
      })

      expect(contract.isNonJSONResponseExpected).toBe(false)
    })
  })

  describe('DELETE route', () => {
    it('sets default delete route values', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
        description: 'some description',
      })

      expect(contract).toMatchSnapshot()
    })

    it('defaults isEmptyResponseExpected to true for DELETE', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/api/users/123',
      })

      expect(contract.isEmptyResponseExpected).toBe(true)
    })

    it('can override isEmptyResponseExpected for DELETE', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/api/users/123',
        isEmptyResponseExpected: false,
      })

      expect(contract.isEmptyResponseExpected).toBe(false)
    })
  })

  describe('mapRouteToPath compatibility', () => {
    it('returns path without params', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/')
    })

    it('returns path with one param', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/users/:userId')
    })

    it('returns path with multiple params', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_MULTI_SCHEMA,
        pathResolver: (pathParams) => `/orgs/${pathParams.orgId}/users/${pathParams.userId}`,
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/orgs/:orgId/users/:userId')
    })
  })

  describe('describeContract compatibility', () => {
    it('returns path without params', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
      })

      expect(describeContract(contract)).toEqual('GET /')
    })

    it('returns path with one param', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      expect(describeContract(contract)).toEqual('GET /users/:userId')
    })

    it('returns path with multiple params for POST', () => {
      const contract = buildRestContract({
        method: 'post',
        requestBodySchema: z.undefined(),
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_MULTI_SCHEMA,
        pathResolver: (pathParams) => `/orgs/${pathParams.orgId}/users/${pathParams.userId}`,
      })

      expect(describeContract(contract)).toEqual('POST /orgs/:orgId/users/:userId')
    })

    it('returns DELETE method correctly', () => {
      const contract = buildRestContract({
        method: 'delete',
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      expect(describeContract(contract)).toEqual('DELETE /users/:userId')
    })
  })

  describe('responseHeaderSchema', () => {
    describe('POST route', () => {
      it('includes responseHeaderSchema in the contract', () => {
        const contract = buildRestContract({
          successResponseBodySchema: BODY_SCHEMA,
          requestBodySchema: BODY_SCHEMA,
          method: 'post',
          pathResolver: () => '/api/data',
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
        })

        expect(contract.responseHeaderSchema).toBeDefined()
        expect(contract.responseHeaderSchema).toBe(RESPONSE_HEADER_SCHEMA)
      })

      it('works with both request and response header schemas', () => {
        const contract = buildRestContract({
          successResponseBodySchema: BODY_SCHEMA,
          requestBodySchema: BODY_SCHEMA,
          method: 'post',
          pathResolver: () => '/api/data',
          requestHeaderSchema: REQUEST_HEADER_SCHEMA,
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
        })

        expect(contract.requestHeaderSchema).toBe(REQUEST_HEADER_SCHEMA)
        expect(contract.responseHeaderSchema).toBe(RESPONSE_HEADER_SCHEMA)
        expect(contract).toMatchSnapshot()
      })
    })

    describe('GET route', () => {
      it('includes responseHeaderSchema in the contract', () => {
        const contract = buildRestContract({
          successResponseBodySchema: BODY_SCHEMA,
          pathResolver: () => '/api/data',
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
        })

        expect(contract.responseHeaderSchema).toBeDefined()
        expect(contract.responseHeaderSchema).toBe(RESPONSE_HEADER_SCHEMA)
      })

      it('works with both request and response header schemas', () => {
        const contract = buildRestContract({
          successResponseBodySchema: BODY_SCHEMA,
          pathResolver: () => '/api/data',
          requestHeaderSchema: REQUEST_HEADER_SCHEMA,
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
          description: 'Get data with rate limiting',
        })

        expect(contract.requestHeaderSchema).toBe(REQUEST_HEADER_SCHEMA)
        expect(contract.responseHeaderSchema).toBe(RESPONSE_HEADER_SCHEMA)
        expect(contract).toMatchSnapshot()
      })

      it('validates response header schema with path params', () => {
        const contract = buildRestContract({
          successResponseBodySchema: BODY_SCHEMA,
          requestPathParamsSchema: PATH_PARAMS_SCHEMA,
          pathResolver: (pathParams) => `/users/${pathParams.userId}`,
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
        })

        expect(contract.responseHeaderSchema).toBeDefined()
        expect(contract.requestPathParamsSchema).toBeDefined()
        expect(contract).toMatchSnapshot()
      })
    })

    describe('DELETE route', () => {
      it('includes responseHeaderSchema in the contract', () => {
        const contract = buildRestContract({
          method: 'delete',
          successResponseBodySchema: BODY_SCHEMA,
          pathResolver: () => '/api/data',
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
        })

        expect(contract.responseHeaderSchema).toBeDefined()
        expect(contract.responseHeaderSchema).toBe(RESPONSE_HEADER_SCHEMA)
      })

      it('works with both request and response header schemas', () => {
        const contract = buildRestContract({
          method: 'delete',
          successResponseBodySchema: BODY_SCHEMA,
          pathResolver: () => '/api/data',
          requestHeaderSchema: REQUEST_HEADER_SCHEMA,
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
          description: 'Delete data with rate limiting',
        })

        expect(contract.requestHeaderSchema).toBe(REQUEST_HEADER_SCHEMA)
        expect(contract.responseHeaderSchema).toBe(RESPONSE_HEADER_SCHEMA)
        expect(contract).toMatchSnapshot()
      })
    })
  })

  describe('optional fields', () => {
    it('supports summary field', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/api/users',
        summary: 'Get all users',
      })

      expect(contract.summary).toBe('Get all users')
    })

    it('supports tags field', () => {
      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/api/users',
        tags: ['users', 'api'],
      })

      expect(contract.tags).toEqual(['users', 'api'])
    })

    it('supports requestQuerySchema', () => {
      const querySchema = z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
      })

      const contract = buildRestContract({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/api/users',
        requestQuerySchema: querySchema,
      })

      expect(contract.requestQuerySchema).toBe(querySchema)
    })

    it('supports isNonJSONResponseExpected', () => {
      const contract = buildRestContract({
        successResponseBodySchema: z.string(),
        pathResolver: () => '/api/file',
        isNonJSONResponseExpected: true,
      })

      expect(contract.isNonJSONResponseExpected).toBe(true)
    })
  })
})
