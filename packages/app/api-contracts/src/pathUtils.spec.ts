import { describe, expect, it } from 'vitest'
import { buildRequestPath } from './pathUtils.ts'

describe('buildRequestPath', () => {
  describe('when pathPrefix is not provided', () => {
    it('should return the original path with slash at the beginning', () => {
      expect(buildRequestPath('/api/users')).toBe('/api/users')
      expect(buildRequestPath('api/users')).toBe('/api/users')
    })

    it('should handle undefined pathPrefix', () => {
      expect(buildRequestPath('/api/users', undefined)).toBe('/api/users')
    })
  })

  describe('when pathPrefix is provided', () => {
    it('should concatenate pathPrefix and path with single slash', () => {
      expect(buildRequestPath('/api/users', '/v1')).toBe('/v1/api/users')
      expect(buildRequestPath('api/users', '/v1')).toBe('/v1/api/users')
    })

    it('should handle pathPrefix without leading slash', () => {
      expect(buildRequestPath('/api/users', 'v1')).toBe('/v1/api/users')
      expect(buildRequestPath('api/users', 'v1')).toBe('/v1/api/users')
    })

    it('should handle pathPrefix with trailing slash', () => {
      expect(buildRequestPath('/api/users', '/v1/')).toBe('/v1/api/users')
      expect(buildRequestPath('api/users', '/v1/')).toBe('/v1/api/users')
      expect(buildRequestPath('/api/users', 'v1/')).toBe('/v1/api/users')
    })

    it('should handle empty strings', () => {
      expect(buildRequestPath('', '/v1')).toBe('/v1/')
      expect(buildRequestPath('/api/users', '')).toBe('/api/users')
      expect(buildRequestPath('', '')).toBe('/')
    })

    it('should handle root paths', () => {
      expect(buildRequestPath('/', '/v1')).toBe('/v1/')
      expect(buildRequestPath('/api/users', '/')).toBe('/api/users')
    })

    it('should handle complex nested paths', () => {
      expect(buildRequestPath('/api/v2/users/123', '/admin/panel/')).toBe(
        '/admin/panel/api/v2/users/123',
      )
      expect(buildRequestPath('api/v2/users/123', 'admin')).toBe('/admin/api/v2/users/123')
    })
  })
})
