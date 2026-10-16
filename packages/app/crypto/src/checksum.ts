import { createHash, hash } from 'node:crypto'
import type { Readable } from 'node:stream'
import { isArrayBufferView } from 'node:util/types'
import { serialize } from 'ohash'

// MD5 is fine for detecting changed content. Don't use these checksums for anything security-related.
const HASH_ALGORITHM = 'md5'

/**
 * Returns an MD5 checksum, as hex, for any value.
 *
 * For detecting changed content only. MD5 collisions can be crafted, so don't use this for anything
 * security-related; use `calculateHash` or `calculateHmac` instead.
 *
 * Strings and binary views are hashed as their raw bytes, so `calculateChecksum('abc')` is the plain MD5 of `abc`.
 * Every other value is serialized by ohash, which hashes objects, `Map`s and `Set`s regardless of order. A string
 * that equals another value's serialization shares its checksum, so `calculateChecksum('1')` matches
 * `calculateChecksum(1)`.
 *
 * Don't pass a stream: it would be serialized by its internal fields, not its content, so streams with different
 * content would share a checksum. Use `calculateStreamChecksum`, which reads the stream to the end.
 */
export function calculateChecksum(value: unknown): string {
  if (typeof value === 'string' || isArrayBufferView(value)) {
    return hash(HASH_ALGORITHM, value)
  }

  return hash(HASH_ALGORITHM, serialize(value))
}

/**
 * Reads the stream to the end and resolves with the MD5 checksum of its content, as hex. The result matches
 * `calculateChecksum` for the same bytes, so a file's stream and its buffer get the same checksum.
 *
 * For detecting changed content only. MD5 collisions can be crafted, so don't use this for anything
 * security-related; use `calculateHash` or `calculateHmac` instead.
 *
 * The stream is consumed, so it can't be read again afterward. Rejects if the stream errors, or if it emits chunks
 * that aren't strings or binary views, such as objects from an object-mode stream.
 */
export async function calculateStreamChecksum(readable: Readable): Promise<string> {
  const hash = createHash(HASH_ALGORITHM)

  for await (const chunk of readable) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}
