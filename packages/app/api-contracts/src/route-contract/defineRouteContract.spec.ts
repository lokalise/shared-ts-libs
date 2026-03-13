import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'
import { defineRouteContract } from './defineRouteContract.ts'
import type { ExtractPathParams, InferSuccessSchema } from './inferTypes.ts'

describe('defineRouteContract', () => {
  it('preserves exact path literal type', () => {
    const route = defineRouteContract({
      method: 'get',
      path: '/users/:id',
    })
    expectTypeOf(route.path).toEqualTypeOf<'/users/:id'>()
    expectTypeOf<ExtractPathParams<typeof route.path>>().toEqualTypeOf<{ id: string }>()
  })

  it('preserves responseSchemasByStatusCode for success schema inference', () => {
    const schema200 = z.object({ name: z.string() })
    const route = defineRouteContract({
      method: 'get',
      path: '/users',
      responseSchemasByStatusCode: {
        200: schema200,
      },
    })

    type SuccessSchema = InferSuccessSchema<typeof route.responseSchemasByStatusCode>
    expectTypeOf<SuccessSchema>().toEqualTypeOf<typeof schema200>()
  })
})
