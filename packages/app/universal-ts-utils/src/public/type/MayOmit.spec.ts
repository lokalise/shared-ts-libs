import { describe, it } from 'vitest'
import type { MayOmit } from './MayOmit.js'

describe('MayOmit', () => {
  it('should make specified keys optional', () => {
    type Config = {
      host: string
      port: number
      secure: boolean
    }

    type PartialConfig = MayOmit<Config, 'secure'>

    const _config1: PartialConfig = {
      host: 'localhost',
      port: 8080,
    }

    const _config2: PartialConfig = {
      host: 'localhost',
      port: 8080,
      secure: true,
    }

    // @ts-expect-error -> missing required key 'host'
    const _invalidConfig1: PartialConfig = { port: 123 }

    // @ts-expect-error -> missing required key 'port'
    const _invalidConfig2: PartialConfig = { host: 'localhost' }
  })
})
