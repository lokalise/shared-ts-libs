import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { buildDeleteRoute, buildGetRoute, buildPayloadRoute } from './apiContracts.ts'

describe('legacy builders type inference', () => {
  describe('isEmptyResponseExpected types', () => {
    it('buildGetRoute defaults to false type', () => {
      const contract = buildGetRoute({
        visibility: 'public',
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false>()
    })

    it('buildPayloadRoute defaults to false type', () => {
      const contract = buildPayloadRoute({
        visibility: 'public',
        method: 'post',
        requestBodySchema: z.object({}),
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false>()
    })

    it('buildDeleteRoute defaults to true type', () => {
      const contract = buildDeleteRoute({
        visibility: 'public',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/resource',
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true>()
    })

    it('buildGetRoute reflects explicit true value in type', () => {
      const contract = buildGetRoute({
        visibility: 'public',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/void',
        isEmptyResponseExpected: true,
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<true>()
    })

    it('buildDeleteRoute reflects explicit false value in type', () => {
      const contract = buildDeleteRoute({
        visibility: 'public',
        successResponseBodySchema: z.object({ deleted: z.boolean() }),
        pathResolver: () => '/api/resource',
        isEmptyResponseExpected: false,
      })

      expectTypeOf(contract.isEmptyResponseExpected).toEqualTypeOf<false>()
    })
  })

  describe('isNonJSONResponseExpected types', () => {
    it('buildGetRoute defaults to false type', () => {
      const contract = buildGetRoute({
        visibility: 'public',
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false>()
    })

    it('buildPayloadRoute defaults to false type', () => {
      const contract = buildPayloadRoute({
        visibility: 'public',
        method: 'post',
        requestBodySchema: z.object({}),
        successResponseBodySchema: z.object({}),
        pathResolver: () => '/api/data',
      })

      expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false>()
    })

    it('buildDeleteRoute defaults to false type', () => {
      const contract = buildDeleteRoute({
        visibility: 'public',
        successResponseBodySchema: z.undefined(),
        pathResolver: () => '/api/resource',
      })

      expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<false>()
    })

    it('buildGetRoute reflects explicit true value in type', () => {
      const contract = buildGetRoute({
        visibility: 'public',
        successResponseBodySchema: z.string(),
        pathResolver: () => '/api/file',
        isNonJSONResponseExpected: true,
      })

      expectTypeOf(contract.isNonJSONResponseExpected).toEqualTypeOf<true>()
    })
  })
})
