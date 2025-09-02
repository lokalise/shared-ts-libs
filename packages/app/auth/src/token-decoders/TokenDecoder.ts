import type { RequestContext } from '@lokalise/fastify-extras'
import { type Either, stringValueSerializer } from '@lokalise/node-core'
import { isError } from '@lokalise/universal-ts-utils/node'
import { TokenError } from 'fast-jwt'
import { stdSerializers } from 'pino'

/**
 * Represents possible token validation errors that can occur during token verification
 */
export type TokenValidationError = 'INVALID_TOKEN' | 'EXPIRED_TOKEN'

/**
 * Function type for token verification that can return a promise or synchronous result
 */
type Verify = (token: string) => Promise<unknown> | unknown

/**
 * Abstract base class for token decoders that provides common token verification functionality.
 *
 * This class handles token decoding, error mapping, and logging for different token types.
 * It provides a unified interface for token verification while allowing specific implementations
 * to define their own verification logic through the constructor.
 */
export abstract class TokenDecoder {
  private readonly verify: Verify

  protected constructor(verify: Verify) {
    this.verify = verify
  }

  /**
   * Verifies and decodes the provided token.
   *
   * This method attempts to verify the token using the configured verification function.
   * It returns an Either type containing either a validation error or the decoded token payload.
   * All errors are properly logged and mapped to appropriate error types.
   *
   * @param requestContext - The request context for logging purposes
   * @param token - The token string to verify and decode
   * @returns Promise that resolves to Either contain validation error or decoded payload
   */
  public async decode(
    requestContext: RequestContext,
    token: string,
  ): Promise<Either<TokenValidationError, object>> {
    try {
      const result = await Promise.resolve(this.verify(token))
      return this.handleSuccessfulDecode(requestContext, result)
    } catch (error) {
      return this.handleDecodeError(requestContext, error)
    }
  }

  /**
   * Handles successful token verification and validates payload structure.
   *
   * This method ensures that the decoded payload is a valid object and logs any
   * structural issues. It throws an error if the payload is not an object.
   *
   * @param requestContext - The request context for logging purposes
   * @param payload - The decoded token payload to validate
   * @returns Either containing the validated payload object
   */
  protected handleSuccessfulDecode(
    requestContext: RequestContext,
    payload: unknown,
  ): Either<TokenValidationError, object> {
    if (!isValidTokenPayload(payload)) {
      requestContext.logger.error(
        { origin: this.constructor.name, payload: stringValueSerializer(payload) },
        'Decoded token payload is not an object',
      )
      throw new Error('Decoded token payload is not an object')
    }

    return { result: payload }
  }

  /**
   * Handles token verification errors and maps them to appropriate error codes.
   *
   * This method processes different types of errors that can occur during token verification.
   * It specifically handles TokenError instances and maps them to validation error types,
   * while logging unexpected errors and re-throwing them.
   *
   * @param requestContext - The request context for logging purposes
   * @param error - The error that occurred during token verification
   * @returns Either containing the mapped validation error
   */
  protected handleDecodeError(
    requestContext: RequestContext,
    error: unknown,
  ): Either<TokenValidationError, object> {
    if (!(error instanceof TokenError)) {
      requestContext.logger.error(
        {
          origin: this.constructor.name,
          error: isError(error) ? stdSerializers.err(error) : stringValueSerializer(error),
        },
        'Token verification failed because of an unexpected error',
      )
      throw error
    }

    return { error: this.mapTokenErrorToValidationError(error) }
  }

  /**
   * Maps TokenError codes to validation error types.
   *
   * This method provides a mapping from fast-jwt TokenError codes to the
   * application's TokenValidationError types for consistent error handling.
   *
   * @param error - The TokenError instance to map
   * @returns The corresponding TokenValidationError type
   */
  private mapTokenErrorToValidationError(error: TokenError): TokenValidationError {
    switch (error.code) {
      case TokenError.codes.expired:
        return 'EXPIRED_TOKEN'
      default:
        return 'INVALID_TOKEN'
    }
  }
}

const isValidTokenPayload = (payload: unknown): payload is object =>
  typeof payload === 'object' && !!payload
