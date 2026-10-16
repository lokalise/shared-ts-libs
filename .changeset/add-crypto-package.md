---
'@lokalise/crypto': major
---

Initial release of `@lokalise/crypto`, with hashing, checksum and encryption helpers built on `node:crypto`:

- `generateHash` and `generateHmac`, with `HashAlgorithm` and `HashEncoding`
- `generateChecksumForBufferOrString`, `generateChecksumForObject` and `generateChecksumForReadable`, using MD5
- `EncryptionUtility`, AES-256-GCM with a PBKDF2-derived key
