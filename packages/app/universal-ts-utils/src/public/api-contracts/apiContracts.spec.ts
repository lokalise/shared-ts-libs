import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildDeleteRoute, buildGetRoute, buildPayloadRoute } from './apiContracts.js'

const BODY_SCHEMA = z.object({})
const PATH_PARAMS_SCHEMA = z.object({
  userId: z.string(),
})

describe('apiContracts', () => {
  describe('buildChangeRoute', () => {
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
})
