import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  buildDeleteRoute,
  buildGetRoute,
  buildPayloadRoute,
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
})
