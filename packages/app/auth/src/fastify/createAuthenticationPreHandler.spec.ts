import { constants as httpConstants } from 'node:http2'
import { PublicNonRecoverableError } from '@lokalise/node-core'
import { isError } from '@lokalise/universal-ts-utils/node'
import type { FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockFastifyRequest } from '../../tests/createMockFastifyRequest.ts'
import type { Authenticator, AuthResult, BaseAuthInfo } from '../authenticators/index.ts'
import { createAuthenticationPreHandler } from './createAuthenticationPreHandler.ts'

type AuthInfo = BaseAuthInfo<'test-provider'>

class MockAuthenticator implements Authenticator<AuthInfo> {
  private readonly result: AuthResult<AuthInfo>

  constructor(result: AuthResult<AuthInfo>) {
    this.result = result
  }

  authenticate(): Promise<AuthResult<AuthInfo>> {
    return Promise.resolve(this.result)
  }
}

describe('createAuthenticationPreHandler', () => {
  let mockRequest: FastifyRequest

  beforeEach(() => {
    mockRequest = createMockFastifyRequest('Bearer test-token')
    vi.clearAllMocks()
  })

  describe('successful authentication', () => {
    it('attaches auth info to request context when authentication succeeds', async () => {
      // Given
      const authInfo: AuthInfo = {
        authType: 'test-provider',
        rawToken: 'test-token',
      }
      const authenticator = new MockAuthenticator({ success: true, authInfo })
      const preHandler = createAuthenticationPreHandler(authenticator)

      // When
      await preHandler(mockRequest)

      // Then
      expect(mockRequest.reqContext.auth).toEqual(authInfo)
    })
  })

  describe('authentication failures', () => {
    describe('EXPIRED_CREDENTIALS failure', () => {
      it('throws PublicNonRecoverableError with 401 status for expired credentials', async () => {
        // Given
        const authenticator = new MockAuthenticator({
          success: false,
          failure: 'EXPIRED_CREDENTIALS',
        })
        const preHandler = createAuthenticationPreHandler(authenticator)

        // When
        let error: Error | undefined
        try {
          await preHandler(mockRequest)
        } catch (e) {
          if (isError(e)) error = e
        }

        // Then
        expect(error).toBeInstanceOf(PublicNonRecoverableError)
        expect('httpStatusCode' in error! && error.httpStatusCode).toBe(
          httpConstants.HTTP_STATUS_UNAUTHORIZED,
        )
        expect(error?.message).toBe('Authentication credentials have expired')
        expect('errorCode' in error! && error.errorCode).toBe('EXPIRED_CREDENTIALS')
      })
    })

    describe('INVALID_CREDENTIALS failure', () => {
      it('throws PublicNonRecoverableError with 401 status for invalid credentials', async () => {
        // Given
        const authenticator = new MockAuthenticator({
          success: false,
          failure: 'INVALID_CREDENTIALS',
        })
        const preHandler = createAuthenticationPreHandler(authenticator)

        // When
        let error: Error | undefined
        try {
          await preHandler(mockRequest)
        } catch (e) {
          if (isError(e)) error = e
        }
        expect(error).toBeInstanceOf(PublicNonRecoverableError)
        expect('httpStatusCode' in error! && error.httpStatusCode).toBe(
          httpConstants.HTTP_STATUS_UNAUTHORIZED,
        )
        expect(error?.message).toBe('Authentication credentials are invalid or missing')
        expect('errorCode' in error! && error.errorCode).toBe('INVALID_CREDENTIALS')
      })
    })
  })

  describe('error handling edge cases', () => {
    it('handles authenticator returning unexpected failure reason', async () => {
      // Given
      const mockAuthenticate = vi.fn().mockResolvedValue({
        success: false,
        failure: 'UNEXPECTED_FAILURE' as any,
      })
      const authenticator = { authenticate: mockAuthenticate } as unknown as Authenticator<AuthInfo>
      const preHandler = createAuthenticationPreHandler(authenticator)

      // When
      let error: Error | undefined
      try {
        await preHandler(mockRequest)
      } catch (e) {
        if (isError(e)) error = e
      }

      expect(error).toBeInstanceOf(PublicNonRecoverableError)
      expect('httpStatusCode' in error! && error.httpStatusCode).toBe(
        httpConstants.HTTP_STATUS_UNAUTHORIZED,
      )
      expect(error?.message).toBe('Authentication credentials are invalid or missing')
      expect('errorCode' in error! && error.errorCode).toBe('INVALID_CREDENTIALS')
    })

    it('handles authenticator returning malformed result', async () => {
      // Given
      const mockAuthenticate = vi.fn().mockResolvedValue({
        success: false,
        // Missing failure property
      } as any)
      const authenticator = { authenticate: mockAuthenticate } as unknown as Authenticator<AuthInfo>
      const preHandler = createAuthenticationPreHandler(authenticator)

      // When & Then
      await expect(preHandler(mockRequest)).rejects.toThrow()
    })
  })
})
