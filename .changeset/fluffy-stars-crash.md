---
"@lokalise/auth": patch
---

Fix JwksTokenDecoder bypassing the jwks-rsa cache for tokens with an empty-string `kid`.
