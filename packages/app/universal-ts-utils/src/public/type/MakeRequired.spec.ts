import { describe, expectTypeOf, it } from 'vitest'
import type { MakeRequired } from './MakeRequired.ts'

describe('MakeRequired', () => {
  it('should make specified keys required', () => {
    type Config = {
      host: string
      port?: number | null
      secure?: boolean
    }

    // Define a type where 'host' is required
    type StrictConfig = MakeRequired<Config, 'port'>

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
    // missing the required key 'port
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
