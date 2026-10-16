import { createHash, createHmac } from 'node:crypto'

export const HashEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
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
 * generateHash(HashAlgorithm.SHA256, 'abc') // 'ba7816bf…'
 */
export function generateHash(
  algorithm: HashAlgorithm,
  data: string,
  encoding: HashEncoding = HashEncoding.HEX,
): string {
  return createHash(algorithm).update(data).digest(encoding)
}

/**
 * Computes an HMAC of a UTF-8 string, keyed with `pepper`.
 */
export function generateHmac(
  algorithm: HashAlgorithm,
  data: string,
  pepper: Buffer,
  encoding: HashEncoding = HashEncoding.HEX,
): string {
  return createHmac(algorithm, pepper).update(data, 'utf8').digest(encoding)
}
