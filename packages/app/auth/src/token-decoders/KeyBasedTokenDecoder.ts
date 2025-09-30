import { createVerifier, type VerifierOptions } from 'fast-jwt'
import { TokenDecoder } from './TokenDecoder.ts'

/**
 * Token decoder implementation that uses a static key for token verification.
 *
 * This decoder uses a pre-configured key (symmetric or asymmetric) to verify JWT tokens.
 * It's suitable for scenarios where you have a known key and don't need to fetch keys
 * dynamically from a JWKS endpoint. Commonly used with HMAC algorithms or when you
 * have a specific RSA/EC public key.
 */
export class KeyBasedTokenDecoder extends TokenDecoder {
  constructor(key: string, options?: Partial<VerifierOptions>) {
    super(createVerifier({ key, ...options }))
  }
}
