import type { FreeformRecord } from '@lokalise/node-core'
import { createVerifier, type DecodedJwt, type VerifierOptions } from 'fast-jwt'
import type { JwksClient } from 'jwks-rsa'
import { TokenDecoder } from './TokenDecoder.ts'

/**
 * Token decoder implementation that uses JSON Web Key Set (JWKS) for token verification.
 *
 * This decoder fetches public keys from a JWKS endpoint to verify JWT tokens.
 * It supports both key ID (kid) based key selection and fallback to the first available key.
 * This is commonly used with OAuth 2.0 and OpenID Connect providers.
 */
export class JwksTokenDecoder extends TokenDecoder {
  private readonly jwksClient: JwksClient

  constructor(jwksClient: JwksClient, options?: Partial<VerifierOptions>) {
    super(
      createVerifier({
        key: async ({ header }: DecodedJwt) => this.getPublicKey(header),
        ...options,
      }),
    )

    this.jwksClient = jwksClient
  }

  private async getKeyByKid(kid: string): Promise<string> {
    const key = await this.jwksClient.getSigningKey(kid)
    return key.getPublicKey()
  }

  private async getFirstAvailableKey(): Promise<string> {
    const keys = await this.jwksClient.getSigningKeys()
    if (!keys[0]) {
      throw new Error('No signing keys available in JWKS')
    }

    return keys[0].getPublicKey()
  }

  private getPublicKey(header: FreeformRecord): Promise<string> {
    return header.kid ? this.getKeyByKid(header.kid) : this.getFirstAvailableKey()
  }
}
