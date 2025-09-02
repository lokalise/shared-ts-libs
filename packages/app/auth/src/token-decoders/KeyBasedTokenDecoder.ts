import { createVerifier, type VerifierOptions } from 'fast-jwt'
import { TokenDecoder } from './TokenDecoder.ts'

export class KeyBasedTokenDecoder extends TokenDecoder {
  constructor(key: string, options?: Partial<VerifierOptions>) {
    super(createVerifier({ key, ...options }))
  }
}
