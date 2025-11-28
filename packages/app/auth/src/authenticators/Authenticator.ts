import type { FastifyRequest } from 'fastify'

/**
 * Base authentication information shared by all authenticators
 */
export type BaseAuthInfo<AuthType extends string> = {
  authType: AuthType
  /** The raw authentication token. May be forwarded to downstream services. */
  token: string
}

/**
 * Authentication failure reasons that can be signaled to the preHandler
 */
export type AuthFailureReason = 'INVALID_CREDENTIALS' | 'EXPIRED_CREDENTIALS'

/**
 * Authentication result that can represent success or failure
 */
export type AuthResult<AuthInfo extends BaseAuthInfo<string>> =
  | { success: true; authInfo: AuthInfo }
  | { success: false; failure: AuthFailureReason }

/**
 * Unified authenticator interface
 * Both individual authenticators and chains implement this interface
 */
export interface Authenticator<AuthInfo extends BaseAuthInfo<string>> {
  /**
   * Attempts to authenticate a request by extracting and validating credentials
   * @param request - The Fastify request object
   * @returns Promise with AuthResult
   */
  authenticate(request: FastifyRequest): Promise<AuthResult<AuthInfo>>
}
