import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { buildDeleteRoute, buildGetRoute, buildPayloadRoute } from './apiContracts.ts'

const SCHEMA = z.object({})

type Metadata = {
  myTestProp?: string[]
  mySecondTestProp?: number
}

declare module './apiContracts.ts' {
  interface CommonRouteDefinitionMetadata extends Metadata {}
}

describe('apiContracts metadata augmentation', () => {
  describe('buildPayloadRoute', () => {
    it('should respect metadata type and reflect it on contract', () => {
      const contract = buildPayloadRoute({
        successResponseBodySchema: SCHEMA,
        requestBodySchema: SCHEMA,
        method: 'post',
        pathResolver: () => '/',
        metadata: {
          myTestProp: ['test'],
          mySecondTestProp: 1,
          extra: 'extra field',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()

      expect(contract.metadata).toEqual({
        myTestProp: ['test'],
        mySecondTestProp: 1,
        extra: 'extra field',
      })
    })
  })

  describe('buildGetRoute', () => {
    it('should respect metadata type and reflect it on contract', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: SCHEMA,
        pathResolver: () => '/',
        metadata: {
          myTestProp: ['test2'],
          mySecondTestProp: 2,
          extra: 'extra field2',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
      expect(contract.metadata).toEqual({
        myTestProp: ['test2'],
        mySecondTestProp: 2,
        extra: 'extra field2',
      })
    })
  })

  describe('buildDeleteRoute', () => {
    it('should respect metadata type', () => {
      const contract = buildDeleteRoute({
        successResponseBodySchema: SCHEMA,
        pathResolver: () => '/',
        metadata: {
          myTestProp: ['test3'],
          mySecondTestProp: 3,
          extra: 'extra field3',
        },
      })

      expectTypeOf(contract.metadata).toMatchTypeOf<Metadata | undefined>()
      expect(contract.metadata).toEqual({
        myTestProp: ['test3'],
        mySecondTestProp: 3,
        extra: 'extra field3',
      })
    })
  })
})
