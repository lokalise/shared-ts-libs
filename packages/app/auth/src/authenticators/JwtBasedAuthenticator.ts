import type { RequestContext } from '@lokalise/fastify-extras'
import type { FastifyRequest } from 'fastify'
import type { TokenDecoder } from '../token-decoders/index.js'
import type { Authenticator, AuthResult, BaseAuthInfo } from './Authenticator.ts'

/**
 * Abstract base class for JWT-based authenticators.
 */
export abstract class JwtBasedAuthenticator<AuthInfo extends BaseAuthInfo<string>>
  implements Authenticator<AuthInfo>
{
  private readonly tokenDecoder: TokenDecoder
  private readonly tokenHeader: string

  constructor(tokenDecoder: TokenDecoder, tokenHeader = 'authorization') {
    this.tokenDecoder = tokenDecoder
    this.tokenHeader = tokenHeader
  }

  authenticate(request: FastifyRequest): Promise<AuthResult<AuthInfo>> {
    const logger = request.reqContext.logger

    const token = this.extractBearerToken(request)
    if (!token) {
      logger.debug(`${this.constructor.name}: No Bearer token found`)
      return Promise.resolve({ success: false, failure: 'INVALID_CREDENTIALS' })
    }

    return this.tokenDecoder.decode(request.reqContext, token).then(({ result, error }) => {
      if (result) return this.internalAuthenticate(request.reqContext, result, token)

      logger.warn({ origin: this.constructor.name, error }, 'Token validation failed')
      switch (error) {
        case 'EXPIRED_TOKEN':
          return {
            success: false,
            failure: 'EXPIRED_CREDENTIALS',
          }
        default:
          return {
            success: false,
            failure: 'INVALID_CREDENTIALS',
          }
      }
    })
  }

  /**
   * Performs authentication logic using the decoded JWT payload.
   * Must be implemented by subclasses to validate the payload and construct the authentication result.
   *
   * @param reqContext - The request context containing request-scoped data and logger.
   * @param jwtPayload - The decoded JWT payload.
   * @param rawToken - The original JWT token string.
   * @returns The authentication result, either success with auth info or failure.
   */
  protected abstract internalAuthenticate(
    reqContext: RequestContext,
    jwtPayload: object,
    rawToken: string,
  ): AuthResult<AuthInfo> | Promise<AuthResult<AuthInfo>>

  private extractBearerToken(request: FastifyRequest): string | null {
    const authHeader = request.headers[this.tokenHeader]
    if (!authHeader || Array.isArray(authHeader) || !authHeader.startsWith('Bearer ')) return null

    return authHeader.substring(7)
  }
}
