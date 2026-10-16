# @lokalise/crypto

Hashing, checksum and encryption helpers built on `node:crypto`.

## Installation

```bash
npm install @lokalise/crypto
```

## Hashes and HMACs

```ts
import { generateHash, generateHmac, HashAlgorithm, HashEncoding } from '@lokalise/crypto'

generateHash(HashAlgorithm.SHA256, 'value') // hex by default
generateHmac(HashAlgorithm.SHA512, 'value', pepper, HashEncoding.BASE64)
```

`HashAlgorithm` and `HashEncoding` are const objects, so passing `'sha256'` works as well as `HashAlgorithm.SHA256`.

## Checksums

MD5 checksums, as hex, for detecting changed content. Don't use them for anything security related.

```ts
import {
  generateChecksumForBufferOrString,
  generateChecksumForObject,
  generateChecksumForReadable,
} from '@lokalise/crypto'

generateChecksumForBufferOrString('value')
generateChecksumForObject({ id: 1 }) // checksum of JSON.stringify, so key order matters
await generateChecksumForReadable(stream) // reads the stream to the end
```

## Encryption

AES-256-GCM, with the key derived from a secret by PBKDF2 (SHA-512) and a random salt for every value.

```ts
import { EncryptionUtility } from '@lokalise/crypto'

const encryption = new EncryptionUtility(secret)
const encrypted = encryption.encrypt('value')
encryption.decrypt(encrypted) // 'value'
```

Options, which must match between `encrypt` and `decrypt`:

| Option | Default | Notes |
| --- | --- | --- |
| `saltLength` | `64` | Salt bytes per value |
| `pbkdf2Iterations` | `100000` | Lowering it makes key derivation faster and weaker |
| `encoding` | `'hex'` | Encoding of the encrypted string |

`decrypt` throws if the value was encrypted with another secret or options, or was modified.
