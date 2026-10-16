import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'

// MD5 is fine for detecting changed content. Don't use these checksums for anything security related.
const HASH_ALGORITHM = 'md5'

/**
 * Returns the MD5 checksum of a buffer or string, as hex.
 */
export function generateChecksumForBufferOrString(data: string | NodeJS.ArrayBufferView): string {
  return createHash(HASH_ALGORITHM).update(data).digest('hex')
}

/**
 * Returns the MD5 checksum of an object's `JSON.stringify` output, as hex. Key order changes the result.
 */
export function generateChecksumForObject(object: object): string {
  return generateChecksumForBufferOrString(JSON.stringify(object))
}

/**
 * Reads the stream to the end and resolves with its MD5 checksum, as hex. Rejects if the stream errors.
 */
export function generateChecksumForReadable(readable: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const hashCreator = createHash(HASH_ALGORITHM)
    readable.on('data', (data) => {
      hashCreator.update(Buffer.isBuffer(data) ? data : Buffer.from(data))
    })
    readable.on('end', () => {
      resolve(hashCreator.digest('hex'))
    })
    readable.on('error', reject)
  })
}
