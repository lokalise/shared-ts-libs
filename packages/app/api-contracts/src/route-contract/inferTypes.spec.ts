import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import type { InferSuccessResponse, InferSuccessSchema } from './inferTypes.ts'

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
})
