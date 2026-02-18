import { describe, expectTypeOf, it } from 'vitest'
import type { MakeNonNullish } from './MakeNonNullish.ts'

describe('MakeNonNullish', () => {
  it('should make specified keys required and non-nullable', () => {
    type Config = {
      host: string
      port?: number | null
      secure?: boolean
    }

    type StrictConfig = MakeNonNullish<Config, 'port'>

    expectTypeOf({
      host: 'localhost',
      port: 123,
    }).toMatchTypeOf<StrictConfig>()
    expectTypeOf({
      host: 'localhost',
      port: 123,
      secure: true,
    }).toMatchTypeOf<StrictConfig>()

    // missing the required key 'host'
    expectTypeOf({ port: 123 }).not.toMatchTypeOf<StrictConfig>()
    // missing the required key 'port'
    expectTypeOf({ host: 'localhost' }).not.toMatchTypeOf<StrictConfig>()

    // null is not allowed for required keys
    expectTypeOf({
      host: 'localhost',
      port: null,
    }).not.toMatchTypeOf<StrictConfig>()

    // undefined is not allowed for required keys
    expectTypeOf({
      host: 'localhost',
      port: undefined,
    }).not.toMatchTypeOf<StrictConfig>()

    // optional keys can still be null or undefined
    expectTypeOf({
      host: 'localhost',
      port: 123,
      secure: undefined,
    }).toMatchTypeOf<StrictConfig>()
  })
})
