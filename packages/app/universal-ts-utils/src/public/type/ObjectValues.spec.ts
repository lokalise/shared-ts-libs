import { describe, expectTypeOf, it } from 'vitest'
import type { ObjectValues } from './ObjectValues.ts'

const MyTypeEnum = { OPTION_A: 'optionA', OPTION_B: 1, OPTION_C: false } as const
type MyType = ObjectValues<typeof MyTypeEnum>

describe('ObjectValues', () => {
  it('should have object values', () => {
    expectTypeOf('optionA' as const).toExtend<MyType>()
    expectTypeOf(1 as const).toExtend<MyType>()
    expectTypeOf(false as const).toExtend<MyType>()
    expectTypeOf('invalid' as const).not.toExtend<MyType>()
  })
})
