import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  buildDeleteRoute,
  buildGetRoute,
  buildPayloadRoute,
  mapRouteToPath,
} from './apiContracts.js'

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
        responseBodySchema: BODY_SCHEMA,
        requestBodySchema: BODY_SCHEMA,
        method: 'post',
        pathResolver: () => '/',
      })

      expect(contract).toMatchSnapshot()
    })
  })

  describe('buildGetRoute', () => {
    it('sets default get route values', () => {
      const contract = buildGetRoute({
        responseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
      })

      expect(contract).toMatchSnapshot()
    })

    it('resolves path params', () => {
      const contract = buildGetRoute({
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      expect(contract).toMatchSnapshot()
    })
  })

  describe('buildDeleteRoute', () => {
    it('sets default delete route values', () => {
      const contract = buildDeleteRoute({
        responseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
      })

      expect(contract).toMatchSnapshot()
    })
  })

  describe('toPath', () => {
    it('returns path without params', () => {
      const contract = buildGetRoute({
        responseBodySchema: BODY_SCHEMA,
        pathResolver: () => '/',
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/')
    })

    it('returns path with one param', () => {
      const contract = buildGetRoute({
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.userId}`,
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/users/:userId')
    })

    it('returns path with multiple params', () => {
      const contract = buildGetRoute({
        responseBodySchema: BODY_SCHEMA,
        requestPathParamsSchema: PATH_PARAMS_MULTI_SCHEMA,
        pathResolver: (pathParams) => `/orgs/${pathParams.orgId}/users/${pathParams.userId}`,
      })

      const path = mapRouteToPath(contract)
      expect(path).toEqual('/orgs/:orgId/users/:userId')
    })
  })
})
