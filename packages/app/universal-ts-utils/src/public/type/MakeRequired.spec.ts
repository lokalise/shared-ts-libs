import { describe, it } from 'vitest'
import type { MakeRequired } from './MakeRequired.js' // Adjust the import path as necessary

describe('MakeRequired', () => {
  it('should make specified keys required', () => {
    type Config = {
      host: string
      port?: number
      secure?: boolean
    }

    // Define a type where 'host' is required
    type StrictConfig = MakeRequired<Config, 'port'>

    const _config1: StrictConfig = { host: 'localhost', port: 123 }

    const _config2: StrictConfig = {
      host: 'localhost',
      port: 123,
      secure: true,
    }

    // @ts-expect-error -> missing the required key 'host'
    const _invalidConfig1: StrictConfig = { port: 123 }

    // @ts-expect-error -> missing the required key 'port'
    const _invalidConfig2: StrictConfig = { host: 'localhost' }
  })
})
