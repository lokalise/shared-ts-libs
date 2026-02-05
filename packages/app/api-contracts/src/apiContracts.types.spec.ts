import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { buildDeleteRoute, buildGetRoute, buildPayloadRoute } from './apiContracts.ts'

describe('legacy builders type inference', () => {
  describe('isEmptyResponseExpected types', () => {
    it('buildGetRoute defaults to false type', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
    })

    it('buildPayloadRoute defaults to false type', () => {
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: z.object({}),
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
    })

    it('buildDeleteRoute defaults to true type', () => {
      const contract = buildDeleteRoute({
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/resource',
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true | undefined>()
    })

    it('buildGetRoute reflects explicit true value in type', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/void',
        isEmptyResponseExpected: true,
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true | undefined>()
    })

    it('buildDeleteRoute reflects explicit false value in type', () => {
      const contract = buildDeleteRoute({
        successResponseBodySchema: z.object({ deleted: z.boolean() }),
        pathResolver: () => '/api/resource',
        isEmptyResponseExpected: false,
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false | undefined>()
    })
  })

  describe('isNonJSONResponseExpected types', () => {
    it('buildGetRoute defaults to false type', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
    })

    it('buildPayloadRoute defaults to false type', () => {
      const contract = buildPayloadRoute({
        method: 'post',
        requestBodySchema: z.object({}),
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
    })

    it('buildDeleteRoute defaults to false type', () => {
      const contract = buildDeleteRoute({
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/resource',
      })

      expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false | undefined>()
    })

    it('buildGetRoute reflects explicit true value in type', () => {
      const contract = buildGetRoute({
        successResponseBodySchema: z.string(),
        pathResolver: () => '/api/file',
        isNonJSONResponseExpected: true,
      })

      expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<true | undefined>()
    })
  })
})
