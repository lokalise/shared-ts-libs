import { describe, expect, it } from 'vitest'
import { hello } from './index.js'

describe('text-measure', () => {
  it('exports hello', () => {
    expect(hello).toBe('world')
  })
})
