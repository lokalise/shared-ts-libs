import { describe, expectTypeOf, it } from 'vitest'
import type { MayOmit } from './MayOmit.js'

describe('MayOmit', () => {
  it('should make specified keys optional', () => {
    type Config = {
      host: string
      port: number
      secure: boolean
    }

    type PartialConfig = MayOmit<Config, 'secure'>

    expectTypeOf({
      host: 'localhost',
      port: 123,
    }).toMatchTypeOf<PartialConfig>()
    expectTypeOf({
      host: 'localhost',
      port: 8080,
      secure: true,
    }).toMatchTypeOf<PartialConfig>()

    // missing required key 'host'
    expectTypeOf({ port: 123 }).not.toMatchTypeOf<PartialConfig>()
    // missing required key 'port'
    expectTypeOf({ host: 'localhost' }).not.toMatchTypeOf<PartialConfig>()
  })
})
