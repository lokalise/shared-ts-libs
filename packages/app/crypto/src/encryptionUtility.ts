import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'

const algorithm = 'aes-256-gcm'
const ivLength = 16
const tagLength = 16
const defaultEncoding = 'hex'
const defaultSaltLength = 64
const defaultPbkdf2Iterations = 100000

export type EncryptionUtilityOptions = {
  /** Default 64 */
  saltLength?: number
  /** Default 100000 */
  pbkdf2Iterations?: number
  /** Encoding of the ciphertext string. Default `hex` */
  encoding?: NodeJS.BufferEncoding
}

/**
 * AES-256-GCM encryption with a key derived from `secret` by PBKDF2 (SHA-512) and a random salt per value.
 * The output is `salt + iv + auth tag + ciphertext`. A port of [cryptr](https://github.com/MauriceButler/cryptr).
 *
 * Decrypting needs the same secret and options that encrypted the value.
 *
 * @example
 * const encryption = new EncryptionUtility(secret)
 * const decrypted = encryption.decrypt(encryption.encrypt('value'))
 */
export class EncryptionUtility {
  private readonly secret: string
  private readonly saltLength: number
  private readonly encryptedPosition: number
  private readonly tagPosition: number
  private readonly pbkdf2Iterations: number
  private readonly encoding: NodeJS.BufferEncoding

  constructor(secret: string, options?: EncryptionUtilityOptions) {
    this.secret = secret

    this.encoding = options?.encoding ?? defaultEncoding
    this.pbkdf2Iterations = options?.pbkdf2Iterations ?? defaultPbkdf2Iterations
    this.saltLength = options?.saltLength ?? defaultSaltLength

    this.tagPosition = this.saltLength + ivLength
    this.encryptedPosition = this.tagPosition + tagLength
  }

  private getKey(salt: Buffer): Buffer {
    return pbkdf2Sync(this.secret, salt, this.pbkdf2Iterations, 32, 'sha512')
  }

  public encrypt(value: string): string {
    const iv = randomBytes(ivLength)
    const salt = randomBytes(this.saltLength)

    const cipher = createCipheriv(algorithm, this.getKey(salt), iv)
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])

    return Buffer.concat([salt, iv, cipher.getAuthTag(), encrypted]).toString(this.encoding)
  }

  /**
   * Throws if the value was encrypted with another secret or options, or was modified.
   */
  public decrypt(value: string): string {
    const stringValue = Buffer.from(String(value), this.encoding)

    const salt = stringValue.subarray(0, this.saltLength)
    const iv = stringValue.subarray(this.saltLength, this.tagPosition)
    const tag = stringValue.subarray(this.tagPosition, this.encryptedPosition)
    const encrypted = stringValue.subarray(this.encryptedPosition)

    const decipher = createDecipheriv(algorithm, this.getKey(salt), iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([
      decipher.update(encrypted),
      Buffer.from(decipher.final('utf8')),
    ]).toString('utf8')
  }
}
