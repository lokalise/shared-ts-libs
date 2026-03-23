import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { ContractNoBody, nonJsonResponse } from './defineRouteContract.ts'
import type {
  HasAnyNonJsonSuccessResponse,
  InferSuccessResponse,
  InferSuccessSchema,
} from './inferTypes.ts'

describe('InferSuccessSchema', () => {
  it('extracts undefined when responseSchemasByStatusCode is undefined', () => {
    type Result = InferSuccessSchema<undefined>
    expectTypeOf<Result>().toEqualTypeOf<undefined>()
  })

  it('extracts never when no success response schemas are defined', () => {
    const schema404 = z.object({ message: z.string() })

    const schemaByStatusCode = {
      404: schema404,
    } as const
    type Result = InferSuccessSchema<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<never>()
  })

  it('extracts the union of success response schemas', () => {
    const schema200 = z.object({ name: z.string() })
    const schema201 = z.object({ id: z.string() })
    const schema404 = z.object({ message: z.string() })

    const schemaByStatusCode = {
      200: schema200,
      201: schema201,
      404: schema404,
    } as const
    type Result = InferSuccessSchema<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<typeof schema200 | typeof schema201>()
  })

  it('maps ContractNoBody sentinel to undefined', () => {
    const schemaByStatusCode = { 204: ContractNoBody } as const
    type Result = InferSuccessSchema<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<undefined>()
  })

  it('extracts the inner schema from TypedNonJsonResponse', () => {
    const schema = z.string()
    const schemaByStatusCode = {
      200: nonJsonResponse({ contentType: 'text/csv', schema }),
    } as const
    type Result = InferSuccessSchema<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<typeof schema>()
  })

  it('excludes sentinels from union when mixed with schemas', () => {
    const schema200 = z.object({ id: z.string() })
    const schemaByStatusCode = { 200: schema200, 204: ContractNoBody } as const
    type Result = InferSuccessSchema<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<typeof schema200 | undefined>()
  })
})

describe('InferSuccessResponse', () => {
  it('extracts undefined when responseSchemasByStatusCode is undefined', () => {
    type Result = InferSuccessResponse<undefined>
    expectTypeOf<Result>().toEqualTypeOf<undefined>()
  })

  it('extracts never when no success response schemas are defined', () => {
    const schema404 = z.object({ message: z.string() })

    const schemaByStatusCode = {
      404: schema404,
    } as const
    type Result = InferSuccessResponse<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<never>()
  })

  it('extracts the union of success response schemas', () => {
    const schema200 = z.object({ name: z.string() })
    const schema201 = z.object({ id: z.string() })
    const schema404 = z.object({ message: z.string() })

    const schemaByStatusCode = {
      200: schema200,
      201: schema201,
      404: schema404,
    } as const
    type Result = InferSuccessResponse<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<{ name: string } | { id: string }>()
  })

  it('maps ContractNoBody sentinel to undefined', () => {
    const schemaByStatusCode = { 204: ContractNoBody } as const
    type Result = InferSuccessResponse<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<undefined>()
  })

  it('infers the output type from TypedNonJsonResponse inner schema', () => {
    const schemaByStatusCode = {
      200: nonJsonResponse({ contentType: 'text/csv', schema: z.string() }),
    } as const
    type Result = InferSuccessResponse<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<string>()
  })

  it('excludes sentinels from union when mixed with schemas', () => {
    const schema200 = z.object({ id: z.string() })
    const schemaByStatusCode = { 200: schema200, 204: ContractNoBody } as const
    type Result = InferSuccessResponse<typeof schemaByStatusCode>

    expectTypeOf<Result>().toEqualTypeOf<{ id: string } | undefined>()
  })
})

describe('HasAnyNonJsonSuccessResponse', () => {
  it('returns false when responseSchemasByStatusCode is undefined', () => {
    type Result = HasAnyNonJsonSuccessResponse<undefined>
    expectTypeOf<Result>().toEqualTypeOf<false>()
  })

  it('returns false when no success schemas are ContractNonJsonResponse', () => {
    const schemaByStatusCode = { 200: z.object({ id: z.string() }) } as const
    type Result = HasAnyNonJsonSuccessResponse<typeof schemaByStatusCode>
    expectTypeOf<Result>().toEqualTypeOf<false>()
  })

  it('returns false for ContractNoBody', () => {
    const schemaByStatusCode = { 204: ContractNoBody } as const
    type Result = HasAnyNonJsonSuccessResponse<typeof schemaByStatusCode>
    expectTypeOf<Result>().toEqualTypeOf<false>()
  })

  it('returns true when a success schema is TypedNonJsonResponse', () => {
    const schemaByStatusCode = {
      200: nonJsonResponse({ contentType: 'text/csv', schema: z.string() }),
    } as const
    type Result = HasAnyNonJsonSuccessResponse<typeof schemaByStatusCode>
    expectTypeOf<Result>().toEqualTypeOf<true>()
  })

  it('returns true when TypedNonJsonResponse is mixed with other schemas', () => {
    const schemaByStatusCode = {
      200: z.object({ id: z.string() }),
      201: nonJsonResponse({ contentType: 'text/csv', schema: z.string() }),
    } as const
    type Result = HasAnyNonJsonSuccessResponse<typeof schemaByStatusCode>
    expectTypeOf<Result>().toEqualTypeOf<true>()
  })

  it('returns false for error-only status codes with TypedNonJsonResponse', () => {
    const schemaByStatusCode = {
      400: nonJsonResponse({ contentType: 'text/plain', schema: z.string() }),
    } as const
    type Result = HasAnyNonJsonSuccessResponse<typeof schemaByStatusCode>
    expectTypeOf<Result>().toEqualTypeOf<false>()
  })
})
