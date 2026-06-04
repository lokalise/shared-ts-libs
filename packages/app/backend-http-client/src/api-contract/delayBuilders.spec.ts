import { describe, expect, it } from 'vitest'
import { constantDelay, exponentialDelay, linearDelay } from './delayBuilders.ts'

describe('delayBuilders', () => {
  describe('constantDelay', () => {
    it('always returns the base delay regardless of attempt number', () => {
      const delay = constantDelay({ baseDelayMs: 200 })
      expect(delay(1)).toBe(200)
      expect(delay(2)).toBe(200)
    })
  })

  describe('linearDelay', () => {
    it('returns attempt * base delay', () => {
      const delay = linearDelay({ baseDelayMs: 100 })
      expect(delay(1)).toBe(100)
      expect(delay(2)).toBe(200)
      expect(delay(3)).toBe(300)
    })
  })

  describe('exponentialDelay', () => {
    it('returns base * 2^(attempt-1) by default', () => {
      const delay = exponentialDelay({ baseDelayMs: 100 })
      expect(delay(1)).toBe(100)
      expect(delay(2)).toBe(200)
      expect(delay(3)).toBe(400)
    })

    it('uses custom multiplier when provided', () => {
      const delay = exponentialDelay({ baseDelayMs: 100, multiplier: 3 })
      expect(delay(1)).toBe(100)
      expect(delay(2)).toBe(300)
      expect(delay(3)).toBe(900)
    })
  })
})
