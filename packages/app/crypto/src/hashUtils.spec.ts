import { describe, expect, it } from 'vitest'
import { generateHash, generateHmac, HashAlgorithm, HashEncoding } from './hashUtils.ts'

// Known answers from FIPS 180-2 (hashes) and RFC 4231 test case 2 (HMACs)
describe('generateHash', () => {
  it('hashes with SHA-256 as hex by default', () => {
    expect(generateHash(HashAlgorithm.SHA256, 'abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('hashes with SHA-512 as base64', () => {
    expect(generateHash(HashAlgorithm.SHA512, 'abc', HashEncoding.BASE64)).toBe(
      '3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==',
    )
  })
})

describe('generateHmac', () => {
  const pepper = Buffer.from('Jefe')
  const data = 'what do ya want for nothing?'

  it('computes HMAC-SHA-256 as hex by default', () => {
    expect(generateHmac(HashAlgorithm.SHA256, data, pepper)).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })

  it('computes HMAC-SHA-256 as base64', () => {
    expect(generateHmac(HashAlgorithm.SHA256, data, pepper, HashEncoding.BASE64)).toBe(
      'W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=',
    )
  })

  it('computes HMAC-SHA-512', () => {
    expect(generateHmac(HashAlgorithm.SHA512, data, pepper, HashEncoding.HEX)).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    )
  })
})
