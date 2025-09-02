import type { RequestContext } from '@lokalise/fastify-extras'
import { type Either, stringValueSerializer } from '@lokalise/node-core'
import { isError } from '@lokalise/universal-ts-utils/node'
import { TokenError } from 'fast-jwt'
import { stdSerializers } from 'pino'

export type TokenValidationError = 'INVALID_TOKEN' | 'EXPIRED_TOKEN'

type Verify = (token: string) => Promise<unknown> | unknown

export abstract class TokenDecoder {
  private readonly verify: Verify

  protected constructor(verify: Verify) {
    this.verify = verify
  }

  /**
   * Verifies and decode the token.
   * Returns an Either type with either a validation error or the decoded token payload.
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
   * Handles successful token verification and validates payload structure
   */
  protected handleSuccessfulDecode(
    requestContext: RequestContext,
    payload: unknown,
  ): Either<TokenValidationError, object> {
    if (!isValidTokenPayload(payload)) {
      requestContext.logger.error(
        { payload: stringValueSerializer(payload) },
        'Decoded token payload is not an object',
      )
      throw new Error('Decoded token payload is not an object')
    }

    return { result: payload }
  }

  /**
   * Handles token verification errors and maps them to appropriate error codes
   */
  protected handleDecodeError(
    requestContext: RequestContext,
    error: unknown,
  ): Either<TokenValidationError, object> {
    if (!(error instanceof TokenError)) {
      requestContext.logger.error(
        { error: isError(error) ? stdSerializers.err(error) : stringValueSerializer(error) },
        'Token verification failed because of an unexpected error',
      )
      throw error
    }

    requestContext.logger.warn(
      { error: stdSerializers.err(error) },
      'JWT token verification failed',
    )

    return { error: this.mapTokenErrorToValidationError(error) }
  }

  /**
   * Maps TokenError codes to validation error types
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
