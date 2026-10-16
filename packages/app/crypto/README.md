# @lokalise/crypto

Hashing, checksum and encryption helpers built on `node:crypto`.

## Installation

```bash
npm install @lokalise/crypto
```

## Hashes and HMACs

```ts
import { calculateHash, calculateHmac, HashAlgorithm, HashEncoding } from '@lokalise/crypto'

calculateHash(HashAlgorithm.SHA256, 'value') // hex by default
calculateHmac(HashAlgorithm.SHA512, 'value', pepper, HashEncoding.BASE64)
```

`HashAlgorithm` and `HashEncoding` are const objects, so passing `'sha256'` works as well as `HashAlgorithm.SHA256`.

## Checksums

MD5 checksums, as hex, for detecting changed content. Don't use them for anything security related.

```ts
import { calculateChecksum, calculateStreamChecksum } from '@lokalise/crypto'

calculateChecksum('value') // plain MD5 of the string's bytes, same as calculateChecksum(Buffer.from('value'))
calculateChecksum({ id: 1, tags: new Set(['a']) }) // key and insertion order don't matter
await calculateStreamChecksum(stream) // reads the stream to the end
```

`calculateChecksum` accepts any value. Strings and binary values are hashed as their raw bytes. Everything else is serialized with [ohash](https://github.com/unjs/ohash) first, so objects, `Map`s and `Set`s are hashed by content regardless of order. A string that equals another value's serialization shares its checksum, e.g. `'1'` and `1`.

## Encryption

AES-256-GCM, with the key derived from a secret by PBKDF2 (SHA-512) and a random salt for every value.

```ts
import { EncryptionUtility } from '@lokalise/crypto'

const encryption = new EncryptionUtility(secret)
const encrypted = encryption.encrypt('value')
encryption.decrypt(encrypted) // 'value'
```

Options, which must match between `encrypt` and `decrypt`:

| Option             | Default  | Notes                                              |
|--------------------|----------|----------------------------------------------------|
| `saltLength`       | `64`     | Salt bytes per value                               |
| `pbkdf2Iterations` | `100000` | Lowering it makes key derivation faster and weaker |
| `encoding`         | `'hex'`  | Encoding of the encrypted string                   |

`decrypt` throws if the value was encrypted with another secret or options, or was modified.
