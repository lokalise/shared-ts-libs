import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { defineRouteContract } from './defineRouteContract.ts'
import type { InferSuccessSchema } from './inferTypes.ts'

describe('defineRouteContract', () => {
  it('preserves responseSchemasByStatusCode for success schema inference', () => {
    const schema200 = z.object({ name: z.string() })
    const route = defineRouteContract({
      method: 'get',
      pathResolver: () => '/users',
      responseSchemasByStatusCode: {
        200: schema200,
      },
    })

    type SuccessSchema = InferSuccessSchema<typeof route.responseSchemasByStatusCode>
    expectTypeOf<SuccessSchema>().toEqualTypeOf<typeof schema200>()
  })
})
