import { describe, expectTypeOf, it } from 'vitest'
import type { AtLeastOne } from './AtLeastOne.ts'

describe('AtLeastOne', () => {
  type Filter = AtLeastOne<{ id: string; name: string }>

  it('accepts objects with one or more of the properties', () => {
    expectTypeOf({ id: '1' }).toMatchTypeOf<Filter>()
    expectTypeOf({ name: 'Alice' }).toMatchTypeOf<Filter>()
    expectTypeOf({ id: '1', name: 'Alice' }).toMatchTypeOf<Filter>()
  })

  it('rejects objects with none of the properties', () => {
    expectTypeOf({}).not.toMatchTypeOf<Filter>()
  })

  it('keeps the property types', () => {
    expectTypeOf({ id: 1 }).not.toMatchTypeOf<Filter>()
  })
})
