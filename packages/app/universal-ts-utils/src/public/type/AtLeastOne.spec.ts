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

  it('requires one of the properties when some of them are optional', () => {
    type OptionalFilter = AtLeastOne<{ id?: string; name?: string }>
    type MixedFilter = AtLeastOne<{ id: string; name?: string }>

    expectTypeOf({ id: '1' }).toMatchTypeOf<OptionalFilter>()
    expectTypeOf({ name: 'Alice' }).toMatchTypeOf<OptionalFilter>()
    expectTypeOf({}).not.toMatchTypeOf<OptionalFilter>()

    expectTypeOf({ name: 'Alice' }).toMatchTypeOf<MixedFilter>()
    expectTypeOf({}).not.toMatchTypeOf<MixedFilter>()
  })
})
