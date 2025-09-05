import type { FastifyRequest } from 'fastify'
import type { Authenticator, AuthResult, BaseAuthInfo } from './Authenticator.ts'

/**
 * Authenticator chain that runs authenticators in sequence until one succeeds.
 * Implements the same Authenticator interface for unified usage.
 */
export class AuthenticatorChain<AuthInfo extends BaseAuthInfo<string>>
  implements Authenticator<AuthInfo>
{
  private readonly authenticators: Authenticator<AuthInfo>[]

  constructor(authenticators: Authenticator<AuthInfo>[]) {
    this.authenticators = authenticators
  }

  async authenticate(request: FastifyRequest): Promise<AuthResult<AuthInfo>> {
    const logger = request.reqContext.logger

    for (const authenticator of this.authenticators) {
      logger.debug(`Attempting authentication with ${authenticator.constructor.name}`)

      const result = await authenticator.authenticate(request)

      if (result.success) {
        logger.debug(`Authentication successful with ${authenticator.constructor.name}`)
        return result
      }

      if (result.failure === 'EXPIRED_CREDENTIALS') {
        logger.debug(
          `Authenticator ${authenticator.constructor.name} failed due to expired credentials`,
        )
        return result
      }
    }

    // No authenticator could find credentials it could work with
    logger.debug(`No authenticator found credentials it could handle`)
    return { success: false, failure: 'INVALID_CREDENTIALS' }
  }
}
