import type { FastifyRequest } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockFastifyRequest } from '../../tests/createMockFastifyRequest.ts'
import type { Authenticator, AuthResult, BaseAuthInfo } from './Authenticator.ts'
import { AuthenticatorChain } from './AuthenticatorChain.ts'

type AuthInfo = BaseAuthInfo<'provider-1' | 'provider-2'>

class MockAuthenticator implements Authenticator<AuthInfo> {
  private readonly result: AuthResult<AuthInfo>

  constructor(result: AuthResult<AuthInfo>) {
    this.result = result
  }

  authenticate(): Promise<AuthResult<AuthInfo>> {
    return Promise.resolve(this.result)
  }
}

describe('AuthenticatorChain', () => {
  let mockRequest: FastifyRequest

  beforeEach(() => {
    mockRequest = createMockFastifyRequest('Bearer test-token')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('authenticate', () => {
    it('returns success result when first authenticator succeeds', async () => {
      // Given
      const authInfo: AuthInfo = {
        authType: 'provider-1',
        token: 'raw-token',
      }

      const firstAuth = new MockAuthenticator({ success: true, authInfo })
      const secondAuth = new MockAuthenticator({ success: false, failure: 'EXPIRED_CREDENTIALS' })

      const chain = new AuthenticatorChain([firstAuth, secondAuth])

      // When
      const result = await chain.authenticate(mockRequest)

      // Then
      expect(result).toEqual({ success: true, authInfo })
    })

    it('tries second authenticator when first returns INVALID_CREDENTIALS', async () => {
      // Given
      const authInfo: AuthInfo = {
        authType: 'provider-2',
        token: 'raw-token',
      }

      const firstAuth = new MockAuthenticator({ success: false, failure: 'INVALID_CREDENTIALS' })
      const secondAuth = new MockAuthenticator({ success: true, authInfo })

      const chain = new AuthenticatorChain([firstAuth, secondAuth])

      // When
      const result = await chain.authenticate(mockRequest)

      // Then
      expect(result).toEqual({ success: true, authInfo })
    })

    it('returns failure when authenticators returns EXPIRED_CREDENTIALS', async () => {
      // Given
      const auth1 = new MockAuthenticator({
        success: false,
        failure: 'EXPIRED_CREDENTIALS',
      })
      const auth2 = new MockAuthenticator({ success: true, authInfo: {} as any })

      const chain = new AuthenticatorChain([auth1, auth2])

      // When
      const result = await chain.authenticate(mockRequest)

      // Then
      expect(result).toEqual({ success: false, failure: 'EXPIRED_CREDENTIALS' })
    })

    it('returns INVALID_CREDENTIALS when all authenticators return INVALID_CREDENTIALS', async () => {
      // Given
      const firstAuth = new MockAuthenticator({ success: false, failure: 'INVALID_CREDENTIALS' })
      const secondAuth = new MockAuthenticator({ success: false, failure: 'INVALID_CREDENTIALS' })

      const chain = new AuthenticatorChain([firstAuth, secondAuth])

      // When
      const result = await chain.authenticate(mockRequest)

      // Then
      expect(result).toEqual({ success: false, failure: 'INVALID_CREDENTIALS' })
    })
  })
})
