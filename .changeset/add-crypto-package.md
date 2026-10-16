---
'@lokalise/crypto': major
---

Initial release of `@lokalise/crypto`, with hashing, checksum and encryption helpers built on `node:crypto`:

- `calculateHash` and `calculateHmac`, with `HashAlgorithm` and `HashEncoding`
- `calculateChecksum` for any value (raw bytes for strings and buffers, order-independent serialization via ohash for everything else) and `calculateStreamChecksum`, using MD5
- `EncryptionUtility`, AES-256-GCM with a PBKDF2-derived key
