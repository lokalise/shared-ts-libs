import { constants as httpConstants } from 'node:http2'
import { PublicNonRecoverableError } from '@lokalise/node-core'
import type { FastifyRequest } from 'fastify'
import type { Authenticator, BaseAuthInfo } from '../authenticators/index.js'

declare module '@lokalise/fastify-extras' {
  interface RequestContext {
    auth?: BaseAuthInfo<string>
  }
}

/**
 * Creates a generic authentication pre-handler that works with any Fastify application.
 * This function returns a pre-handler that can be used with any authenticator implementation.
 *
 * @param authenticator - The authenticator instance to use for authentication
 * @returns A pre-handler function that can be registered with Fastify
 */
export const createAuthenticationPreHandler =
  <AuthInfo extends BaseAuthInfo<string>>(authenticator: Authenticator<AuthInfo>) =>
  async (request: FastifyRequest) => {
    const result = await authenticator.authenticate(request)

    if (result.success) {
      // Authentication successful - attach auth info to request context
      request.reqContext.auth = result.authInfo
      request.reqContext.logger.debug('Authentication successful')
      return
    }

    // Authentication failed - map failure reason to appropriate HTTP response
    const failureReason = result.failure
    request.reqContext.logger.debug(`Authentication failed with reason: ${failureReason}`)

    switch (failureReason) {
      case 'EXPIRED_CREDENTIALS':
        throw new PublicNonRecoverableError({
          httpStatusCode: httpConstants.HTTP_STATUS_UNAUTHORIZED,
          message: 'Authentication credentials have expired',
          errorCode: 'EXPIRED_CREDENTIALS',
        })
      default:
        throw new PublicNonRecoverableError({
          httpStatusCode: httpConstants.HTTP_STATUS_UNAUTHORIZED,
          message: 'Authentication credentials are invalid or missing',
          errorCode: 'INVALID_CREDENTIALS',
        })
    }
  }
