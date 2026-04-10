import { describe, expect, it } from 'vitest'
import { parseRetryAfterHeader, resolveRetryConfig } from './retry.ts'

describe('retry', () => {
  describe('resolveRetryConfig', () => {
    it('returns all defaults when passed true', () => {
      const config = resolveRetryConfig(true)

      expect(config.maxRetries).toBe(2)
      expect(config.statusCodes).toEqual([408, 425, 429, 500, 502, 503, 504])
      expect(config.maxDelay).toBe(30_000)
      expect(config.maxJitter).toBe(100)
      expect(config.respectRetryAfter).toBe(true)
      expect(config.retryOnNetworkError).toBe(true)
      expect(config.retryOnTimeout).toBe(true)
      expect(typeof config.delay).toBe('function')
    })

    it('returns all defaults when passed an empty object', () => {
      const config = resolveRetryConfig({})

      expect(config.maxRetries).toBe(2)
      expect(config.statusCodes).toEqual([408, 425, 429, 500, 502, 503, 504])
      expect(config.maxDelay).toBe(30_000)
      expect(config.maxJitter).toBe(100)
      expect(config.respectRetryAfter).toBe(true)
      expect(config.retryOnNetworkError).toBe(true)
      expect(config.retryOnTimeout).toBe(true)
    })

    it('merges a partial config with defaults', () => {
      const config = resolveRetryConfig({ maxRetries: 5, retryOnTimeout: true })

      expect(config.maxRetries).toBe(5)
      expect(config.retryOnTimeout).toBe(true)
      expect(config.maxJitter).toBe(100)
      expect(config.retryOnNetworkError).toBe(true)
    })

    it('uses all provided values when fully specified', () => {
      const delay = () => 500
      const statusCodes = [429, 503]

      const config = resolveRetryConfig({
        maxRetries: 3,
        statusCodes,
        delay,
        maxDelay: 5_000,
        maxJitter: 50,
        respectRetryAfter: false,
        retryOnNetworkError: false,
        retryOnTimeout: true,
      })

      expect(config.maxRetries).toBe(3)
      expect(config.statusCodes).toBe(statusCodes)
      expect(config.delay).toBe(delay)
      expect(config.maxDelay).toBe(5_000)
      expect(config.maxJitter).toBe(50)
      expect(config.respectRetryAfter).toBe(false)
      expect(config.retryOnNetworkError).toBe(false)
      expect(config.retryOnTimeout).toBe(true)
    })

    it('default delay produces exponential backoff', () => {
      const { delay } = resolveRetryConfig({})

      expect(delay(1)).toBe(100) // 100 * 2^0
      expect(delay(2)).toBe(200) // 100 * 2^1
      expect(delay(3)).toBe(400) // 100 * 2^2
    })
  })

  describe('parseRetryAfterHeader', () => {
    it('returns null when the header is absent', () => {
      expect(parseRetryAfterHeader({})).toBeNull()
    })

    it('returns null when the header value is an empty string', () => {
      expect(parseRetryAfterHeader({ 'retry-after': '' })).toBeNull()
    })

    it('parses a valid integer seconds value', () => {
      expect(parseRetryAfterHeader({ 'retry-after': '60' })).toBe(60_000)
    })

    it('parses zero seconds', () => {
      expect(parseRetryAfterHeader({ 'retry-after': '0' })).toBe(0)
    })

    it('returns null for negative seconds', () => {
      expect(parseRetryAfterHeader({ 'retry-after': '-1' })).toBeNull()
    })

    it('returns null for non-integer seconds', () => {
      expect(parseRetryAfterHeader({ 'retry-after': '1.5' })).toBeNull()
    })

    it('uses the first element when the header value is an array', () => {
      expect(parseRetryAfterHeader({ 'retry-after': ['30', '60'] })).toBe(30_000)
    })

    it('returns a positive delta for a future HTTP-date', () => {
      const futureDate = new Date(Date.now() + 5_000).toUTCString()
      const result = parseRetryAfterHeader({ 'retry-after': futureDate })

      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThanOrEqual(5_100)
    })

    it('returns null for a past HTTP-date', () => {
      const pastDate = new Date(Date.now() - 5_000).toUTCString()
      expect(parseRetryAfterHeader({ 'retry-after': pastDate })).toBeNull()
    })

    it('returns null for an unrecognized format', () => {
      expect(parseRetryAfterHeader({ 'retry-after': 'not-a-valid-value' })).toBeNull()
    })
  })
})
