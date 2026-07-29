import { describe, expect, it } from 'vitest'
import { hello } from './index.ts'

describe('text-measure', () => {
  it('exports hello', () => {
    expect(hello).toBe('world')
  })
})
