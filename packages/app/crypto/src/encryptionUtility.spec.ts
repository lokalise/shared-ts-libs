import { describe, expect, it } from 'vitest'
import { EncryptionUtility } from './encryptionUtility.ts'

const secret = 'myTotalySecretKey'

// Fixed ciphertexts, so a change to the output format or key derivation fails these tests
const storedDefault =
  'ce10652d5117f33f0cdca14420e271f885e4c1d7c92885b4c7577f8607afa394174b9f45bfcac98553f1623c3d74c7d7980cddb85e936d0a5fcbf337e46a4593db513ce94aa4f083c00f6a3620a3edd437ed80566990bfd2abcd7a49f1fdc95b1d5c617991'
const storedCustomOptions = {
  encoding: 'base64',
  saltLength: 10,
  pbkdf2Iterations: 1000,
} as const
const storedCustom = '3lF74iv7g2WGv5o9qKnaDaXEjsHXdh4GRvBYjVHfCI3HOeZiQrHaek6LXvN9Jpb+Gu3lNrKeE9pj'

describe('EncryptionUtility', () => {
  it('decrypts what it encrypted', () => {
    const encryption = new EncryptionUtility(secret)
    const value = 'ßáÇÖÑ 🥓'

    const encrypted = encryption.encrypt(value)

    expect(encrypted).not.toContain(value)
    expect(encryption.decrypt(encrypted)).toBe(value)
  })

  it('uses a new salt and IV for every value', () => {
    const encryption = new EncryptionUtility(secret)

    expect(encryption.encrypt('bacon')).not.toBe(encryption.encrypt('bacon'))
  })

  it('decrypts a stored value encrypted with default options', () => {
    expect(new EncryptionUtility(secret).decrypt(storedDefault)).toBe('bacon')
  })

  it('decrypts a stored value encrypted with custom options', () => {
    const encryption = new EncryptionUtility(secret, storedCustomOptions)

    expect(encryption.decrypt(storedCustom)).toBe('ßáÇÖÑ 🥓')
  })

  it('writes salt, IV, tag and ciphertext in the chosen encoding', () => {
    const encrypted = new EncryptionUtility(secret, { saltLength: 10, encoding: 'base64' }).encrypt(
      'bacon',
    )

    // 10 salt + 16 IV + 16 tag + 5 ciphertext bytes
    expect(Buffer.from(encrypted, 'base64')).toHaveLength(47)
  })

  it('throws for a different secret', () => {
    const encrypted = new EncryptionUtility(secret).encrypt('bacon')

    expect(() => new EncryptionUtility('otherSecret').decrypt(encrypted)).toThrow()
  })

  it('throws for a different PBKDF2 iteration count', () => {
    const encrypted = new EncryptionUtility(secret, storedCustomOptions).encrypt('bacon')
    const otherIterations = new EncryptionUtility(secret, {
      ...storedCustomOptions,
      pbkdf2Iterations: 2000,
    })

    expect(() => otherIterations.decrypt(encrypted)).toThrow()
  })

  it('throws for a modified ciphertext', () => {
    const bytes = Buffer.from(storedDefault, 'hex')
    bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1

    expect(() => new EncryptionUtility(secret).decrypt(bytes.toString('hex'))).toThrow()
  })

  it('throws for a value shorter than salt, IV and tag', () => {
    // Salt, IV and the first 4 tag bytes; GCM would otherwise verify the 4-byte tag
    const truncated = Buffer.from(storedDefault, 'hex').subarray(0, 64 + 16 + 4)

    expect(() => new EncryptionUtility(secret).decrypt(truncated.toString('hex'))).toThrow(
      'Encrypted value is too short: expected at least 96 bytes, got 84',
    )
  })

  it('decrypts an empty string', () => {
    const encryption = new EncryptionUtility(secret)

    expect(encryption.decrypt(encryption.encrypt(''))).toBe('')
  })
})
