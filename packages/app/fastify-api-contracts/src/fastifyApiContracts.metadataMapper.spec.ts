import { buildGetRoute, buildPayloadRoute } from '@lokalise/api-contracts'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { buildFastifyNoPayloadRoute, buildFastifyPayloadRoute } from './fastifyApiContracts.ts'

const SCHEMA = z.object({ id: z.string() })

type Metadata = {
  myProp?: string[]
}

declare module '@lokalise/api-contracts' {
  interface CommonRouteDefinitionMetadata extends Metadata {}
}

describe('fastifyApiContracts - api contract metadata mapper', () => {
  describe('buildFastifyNoPayloadRoute', () => {
    it('should use metadata mapper to build the route', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: SCHEMA,
        requestPathParamsSchema: SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.id}`,
        metadata: {
          myProp: ['test1', 'test2'],
        },
      })

      const route = buildFastifyNoPayloadRoute(
        contract,
        () => Promise.resolve(),
        (metadata) =>
          metadata?.myProp
            ? {
                config: {
                  myProp: metadata.myProp.join('-'),
                },
              }
            : {},
      )

      expect(route.config).toEqual({
        myProp: 'test1-test2',
        apiContract: expect.any(Object),
      })
    })
  })

  describe('buildFastifyPayloadRoute', () => {
    it('should use metadata mapper to build the route', () => {
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: SCHEMA,
        successResponseBodySchema: SCHEMA,
        requestPathParamsSchema: SCHEMA,
        pathResolver: (pathParams) => `/users/${pathParams.id}`,
        metadata: {
          myProp: ['test3', 'test4'],
        },
      })

      const route = buildFastifyPayloadRoute(
        contract,
        () => Promise.resolve(),
        (metadata) => (metadata?.myProp ? { config: { myProp: metadata.myProp.join('-') } } : {}),
      )

      expect(route.config).toEqual({
        myProp: 'test3-test4',
        apiContract: expect.any(Object),
      })
    })
  })
})
