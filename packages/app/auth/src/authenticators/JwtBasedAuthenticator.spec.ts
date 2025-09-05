import type { RequestContext } from '@lokalise/fastify-extras'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockFastifyRequest } from '../../tests/createMockFastifyRequest.js'
import { createToken } from '../../tests/createToken.js'
import { createTestContext, type TestContext } from '../../tests/testContext.js'
import { KeyBasedTokenDecoder, TokenDecoder } from '../token-decoders/index.js'
import type { TokenValidationError } from '../token-decoders/TokenDecoder.ts'
import type { AuthFailureReason, AuthResult, BaseAuthInfo } from './Authenticator.ts'
import { JwtBasedAuthenticator } from './JwtBasedAuthenticator.js'

type AuthInfo = BaseAuthInfo<'test-provider'>

class TestJwtAuthenticator extends JwtBasedAuthenticator<AuthInfo> {
  error?: AuthFailureReason

  constructor(tokenDecoder: TokenDecoder, error?: AuthFailureReason, authHeader?: string) {
    super(tokenDecoder, authHeader)
    this.error = error
  }

  protected override internalAuthenticate(
    _reqContext: RequestContext,
    _jwtPayload: object,
    rawToken: string,
  ): AuthResult<AuthInfo> | Promise<AuthResult<AuthInfo>> {
    if (!this.error) {
      return {
        success: true,
        authInfo: { authType: 'test-provider', rawToken },
      }
    }

    return { success: false, failure: this.error }
  }
}

describe('JwtBasedAuthenticator', () => {
  let testContext: TestContext

  beforeEach(async () => {
    testContext = await createTestContext()
  })

  describe('authenticate', () => {
    describe('successful authentication', () => {
      it('successfully authenticates valid token with default header', async () => {
        // Given
        const token = await createToken(testContext, { foo: 'bar' })
        const request = createMockFastifyRequest(`Bearer ${token}`)
        const authenticator = new TestJwtAuthenticator(
          new KeyBasedTokenDecoder(testContext.publicKeyPem),
        )

        // When
        const result = await authenticator.authenticate(request)

        // Then
        expect(result).toEqual({
          success: true,
          authInfo: { authType: 'test-provider', rawToken: token },
        })
      })

      it('successfully authenticates valid token with custom header', async () => {
        // Given
        const token = await createToken(testContext, { foo: 'bar' })
        const request = createMockFastifyRequest(`Bearer ${token}`, 'x-custom-auth')
        const authenticator = new TestJwtAuthenticator(
          new KeyBasedTokenDecoder(testContext.publicKeyPem),
          undefined,
          'x-custom-auth',
        )

        // When
        const result = await authenticator.authenticate(request)

        // Then
        expect(result).toEqual({
          success: true,
          authInfo: { authType: 'test-provider', rawToken: token },
        })
      })
    })

    describe('no Bearer token', () => {
      it('returns INVALID_CREDENTIALS when no Authorization header', async () => {
        // Given
        const request = createMockFastifyRequest()
        const authenticator = new TestJwtAuthenticator(
          new TokenDecoder(() => {
            throw new Error()
          }),
        )

        // When
        const result = await authenticator.authenticate(request)

        // Then
        expect(result).toEqual({ success: false, failure: 'INVALID_CREDENTIALS' })
      })

      it('returns INVALID_CREDENTIALS when Authorization header is not Bearer', async () => {
        // Given
        const request = createMockFastifyRequest('Basic dXNlcjpwYXNzd29yZA==')
        const authenticator = new TestJwtAuthenticator(
          new TokenDecoder(() => {
            throw new Error()
          }),
        )

        // When
        const result = await authenticator.authenticate(request)

        // Then
        expect(result).toEqual({ success: false, failure: 'INVALID_CREDENTIALS' })
      })

      it('returns INVALID_CREDENTIALS when Authorization header is malformed', async () => {
        // Given
        const request = createMockFastifyRequest('Bearer')
        const authenticator = new TestJwtAuthenticator(
          new TokenDecoder(() => {
            throw new Error()
          }),
        )

        // When
        const result = await authenticator.authenticate(request)

        // Then
        expect(result).toEqual({ success: false, failure: 'INVALID_CREDENTIALS' })
      })
    })

    describe('invalid JWT tokens', () => {
      it('returns INVALID_CREDENTIALS when JWT verification fails with TokenInvalidError', async () => {
        // Given
        const mockTokenDecoder = {
          decode: vi.fn().mockResolvedValue({
            error: 'INVALID_TOKEN' satisfies TokenValidationError,
          }),
        } as unknown as TokenDecoder
        const request = createMockFastifyRequest('Bearer invalid-token')
        const authenticator = new TestJwtAuthenticator(mockTokenDecoder)

        // When
        const result = await authenticator.authenticate(request)

        // Then
        expect(result).toEqual({
          success: false,
          failure: 'INVALID_CREDENTIALS',
        })
        expect(mockTokenDecoder.decode).toHaveBeenCalledWith(request.reqContext, 'invalid-token')
      })

      it('returns EXPIRED_CREDENTIALS when JWT verification fails with TokenExpiredError', async () => {
        // Given
        const mockTokenDecoder = {
          decode: vi.fn().mockResolvedValue({
            error: 'EXPIRED_TOKEN' satisfies TokenValidationError,
          }),
        } as unknown as TokenDecoder
        const request = createMockFastifyRequest('Bearer expired-token')
        const authenticator = new TestJwtAuthenticator(mockTokenDecoder)

        // When
        const result = await authenticator.authenticate(request)

        // Then
        expect(result).toEqual({
          success: false,
          failure: 'EXPIRED_CREDENTIALS',
        })
        expect(mockTokenDecoder.decode).toHaveBeenCalledWith(request.reqContext, 'expired-token')
      })
    })
  })
})
