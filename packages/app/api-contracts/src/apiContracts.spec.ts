import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import {
  buildDeleteRoute,
  buildGetRoute,
  buildPayloadRoute,
  describeContract,
  mapRouteToPath,
} from './apiContracts.ts'

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

describe('apiContracts', () => {
  describe('buildPayloadRoute', () => {
    it('sets default change route values', () => {
      const contract = buildPayloadRoute({
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
  })

  describe('buildGetRoute', () => {
    it('sets default get route values', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
        responseSchemasByStatusCode: {
          '200': BODY_SCHEMA,
          '400': z.object({ message: z.string() }),
        },
        description: 'some description',
        metadata: { hello: 'world' }, // it is a free form record
      })

      expect(contract).toMatchSnapshot()
    })

    it('resolves path params', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      expect(contract).toMatchSnapshot()
    })
  })

  describe('buildDeleteRoute', () => {
    it('sets default delete route values', () => {
      const contract = buildDeleteRoute({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
        description: 'some description',
      })

      expect(contract).toMatchSnapshot()
    })
  })

  describe('mapRouteToPath', () => {
    it('returns path without params', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/')
    })

    it('returns path with one param', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/users/:userId')
    })

    it('returns path with multiple params', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_MULTI_SCHEMA,
        pathResolver: (pathParams) => `/orgs/${pathParams.orgId}/users/${pathParams.userId}`,
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/orgs/:orgId/users/:userId')
    })
  })

  describe('describeContract', () => {
    it('returns path without params', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
      })

      expect(describeContract(contract)).toEqual('GET /')
    })

    it('returns path with one param', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      expect(describeContract(contract)).toEqual('GET /users/:userId')
    })

    it('returns path with multiple params', () => {
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: z.undefined(),
        successResponseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_MULTI_SCHEMA,
        pathResolver: (pathParams) => `/orgs/${pathParams.orgId}/users/${pathParams.userId}`,
      })

      expect(describeContract(contract)).toEqual('POST /orgs/:orgId/users/:userId')
    })
  })

  describe('responseHeaderSchema', () => {
    describe('buildPayloadRoute', () => {
      it('includes responseHeaderSchema in the contract', () => {
        const contract = buildPayloadRoute({
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
        const contract = buildPayloadRoute({
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

    describe('buildGetRoute', () => {
      it('includes responseHeaderSchema in the contract', () => {
        const contract = buildGetRoute({
          successResponseBodySchema: BODY_SCHEMA,
          pathResolver: () => '/api/data',
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
        })

        expect(contract.responseHeaderSchema).toBeDefined()
        expect(contract.responseHeaderSchema).toBe(RESPONSE_HEADER_SCHEMA)
      })

      it('works with both request and response header schemas', () => {
        const contract = buildGetRoute({
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
        const contract = buildGetRoute({
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

    describe('buildDeleteRoute', () => {
      it('includes responseHeaderSchema in the contract', () => {
        const contract = buildDeleteRoute({
          successResponseBodySchema: BODY_SCHEMA,
          pathResolver: () => '/api/data',
          responseHeaderSchema: RESPONSE_HEADER_SCHEMA,
        })

        expect(contract.responseHeaderSchema).toBeDefined()
        expect(contract.responseHeaderSchema).toBe(RESPONSE_HEADER_SCHEMA)
      })

      it('works with both request and response header schemas', () => {
        const contract = buildDeleteRoute({
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

    describe('type inference', () => {
      it('correctly infers response header types', () => {
        const contract = buildGetRoute({
          successResponseBodySchema: BODY_SCHEMA,
          pathResolver: () => '/api/data',
          responseHeaderSchema: z.object({
            'content-type': z.string(),
            'cache-control': z.string(),
          }),
        })

        // Type check - this should compile without errors
        type ResponseHeaders = typeof contract.responseHeaderSchema
        const headers: ResponseHeaders = contract.responseHeaderSchema
        expect(headers).toBeDefined()
      })
    })
  })
})
