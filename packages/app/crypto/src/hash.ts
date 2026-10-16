import { createHmac, hash } from 'node:crypto'

export const HashEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
  BASE64URL: 'base64url',
} as const
export type HashEncoding = (typeof HashEncoding)[keyof typeof HashEncoding]

export const HashAlgorithm = {
  SHA256: 'sha256',
  SHA512: 'sha512',
} as const
export type HashAlgorithm = (typeof HashAlgorithm)[keyof typeof HashAlgorithm]

/**
 * Hashes a UTF-8 string.
 *
 * @example
 * calculateHash(HashAlgorithm.SHA256, 'abc') // 'ba7816bf…'
 */
export function calculateHash(
  algorithm: HashAlgorithm,
  data: string,
  encoding: HashEncoding = HashEncoding.HEX,
): string {
  return hash(algorithm, data, encoding)
}

/**
 * Computes an HMAC of a UTF-8 string, keyed with `pepper`.
 */
export function calculateHmac(
  algorithm: HashAlgorithm,
  data: string,
  pepper: Buffer,
  encoding: HashEncoding = HashEncoding.HEX,
): string {
  return createHmac(algorithm, pepper).update(data, 'utf8').digest(encoding)
}
