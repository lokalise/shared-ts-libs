import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { buildDeleteRoute, buildGetRoute, buildPayloadRoute } from './apiContracts.js'

const SCHEMA = z.object({})

type Metadata = {
  myTestProp?: string[]
  mySecondTestProp?: number
}

declare module './apiContracts.js' {
  interface CommonRouteDefinitionMetadata extends Metadata {}
}

describe('apiContracts metadata augmentation', () => {
  describe('buildPayloadRoute', () => {
    it('should respect metadata type', () => {
      const contract = buildPayloadRoute({
        successResponseBodySchema: SCHEMA,
        requestBodySchema: SCHEMA,
        method: 'post',
        pathResolver: () => '/',
        metadata: {
          myTestProp: ['test'],
          mySecondTestProp: 1,
          error: 'should not be here',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
    })
  })

  describe('buildGetRoute', () => {
    it('should respect metadata type', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: SCHEMA,
        pathResolver: () => '/',
        metadata: {
          myTestProp: ['test'],
          mySecondTestProp: 1,
          error: 'should not be here',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
    })
  })

  describe('buildDeleteRoute', () => {
    it('should respect metadata type', () => {
      const contract = buildDeleteRoute({
        successResponseBodySchema: SCHEMA,
        pathResolver: () => '/',
        metadata: {
          myTestProp: ['test'],
          mySecondTestProp: 1,
          error: 'should not be here',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
    })
  })
})
